-- ─────────────────────────────────────────────────────────────────────────────
-- Deadline extension requests + history, push tokens, and notifications
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Deadline extension requests ───────────────────────────────────────────────
-- One row per user per (round, deadline_type).
-- Cleared after each successful extension so the cycle can repeat.
-- When COUNT(*) >= CEIL(eligible_count / 3.0), the extension fires.

CREATE TABLE deadline_extension_requests (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id       uuid        NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  deadline_type  text        NOT NULL CHECK (deadline_type IN ('submission', 'voting')),
  user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, deadline_type, user_id)
);

CREATE INDEX ON deadline_extension_requests (round_id, deadline_type);

-- ── Deadline extension history ────────────────────────────────────────────────
-- Immutable log of every extension that fired (or was blocked).

CREATE TABLE deadline_extension_log (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id           uuid        NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  deadline_type      text        NOT NULL CHECK (deadline_type IN ('submission', 'voting')),
  outcome            text        NOT NULL CHECK (outcome IN ('extended', 'blocked')),
  previous_deadline  timestamptz NOT NULL,
  new_deadline       timestamptz,          -- null when blocked
  extension_hours    int         NOT NULL DEFAULT 24,
  triggered_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON deadline_extension_log (round_id);

-- ── Push tokens ───────────────────────────────────────────────────────────────
-- Expo push token registered per device. A user may have multiple devices.

CREATE TABLE push_tokens (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       text        NOT NULL,
  platform    text        CHECK (platform IN ('ios', 'android')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX ON push_tokens (user_id);

-- ── Notifications ─────────────────────────────────────────────────────────────
-- Persisted log of notifications (pending → sent → read).
-- Expected types:
--   playlist_ready, subs_due_24h, subs_due_1h, voting_due_24h, voting_due_1h,
--   subs_extended, voting_extended, extension_blocked (commissioner only)

CREATE TABLE notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        text        NOT NULL,
  title       text        NOT NULL,
  body        text,
  data        jsonb,                    -- { round_id, league_id, season_id, ... }
  sent_at     timestamptz,              -- null = not yet dispatched to push service
  read_at     timestamptz,              -- null = unread in-app
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON notifications (user_id, read_at);
CREATE INDEX ON notifications (sent_at) WHERE sent_at IS NULL; -- unsent queue

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE deadline_extension_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE deadline_extension_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications               ENABLE ROW LEVEL SECURITY;

-- Extension requests: participants can read the count for a round; insert their own
CREATE POLICY "ext_requests_select" ON deadline_extension_requests
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ext_requests_insert" ON deadline_extension_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "ext_requests_delete" ON deadline_extension_requests
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Extension log: anyone authenticated can read (shows history in UI)
CREATE POLICY "ext_log_select" ON deadline_extension_log
  FOR SELECT TO authenticated USING (true);

-- Push tokens: users manage only their own
CREATE POLICY "push_tokens_select" ON push_tokens
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "push_tokens_insert" ON push_tokens
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_tokens_delete" ON push_tokens
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Notifications: users see only their own
CREATE POLICY "notifications_select" ON notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
