-- ─────────────────────────────────────────────────────────────────────────────
-- Jams: personal user playlists with per-track and jam-level engagement stats
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE jams (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  title        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE jam_tracks (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  jam_id             uuid        NOT NULL REFERENCES jams(id) ON DELETE CASCADE,
  position           smallint    NOT NULL,
  track_id           text        NOT NULL,
  track_source       text        NOT NULL DEFAULT 'spotify',
  track_title        text        NOT NULL,
  track_artist       text        NOT NULL,
  track_artwork_url  text,
  track_duration_ms  int,
  track_isrc         text,
  track_album_name   text,
  added_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jam_id, track_id),
  UNIQUE (jam_id, position)
);

-- Jam-level: someone started playing the jam
CREATE TABLE jam_plays (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  jam_id      uuid        NOT NULL REFERENCES jams(id) ON DELETE CASCADE,
  listener_id uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  played_at   timestamptz NOT NULL DEFAULT now()
);

-- Track-level: someone played a specific track
CREATE TABLE jam_track_plays (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  jam_track_id   uuid        NOT NULL REFERENCES jam_tracks(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  played_at      timestamptz NOT NULL DEFAULT now()
);

-- Track-level: heart reaction (one per user per track)
CREATE TABLE jam_reactions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  jam_track_id   uuid        NOT NULL REFERENCES jam_tracks(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jam_track_id, user_id)
);

-- Track-level: skip event
CREATE TABLE jam_skips (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  jam_track_id   uuid        NOT NULL REFERENCES jam_tracks(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skipped_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX ON jam_tracks (jam_id);
CREATE INDEX ON jam_plays (jam_id);
CREATE INDEX ON jam_plays (listener_id);
CREATE INDEX ON jam_track_plays (jam_track_id);
CREATE INDEX ON jam_reactions (jam_track_id);
CREATE INDEX ON jam_skips (jam_track_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE jams           ENABLE ROW LEVEL SECURITY;
ALTER TABLE jam_tracks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE jam_plays      ENABLE ROW LEVEL SECURITY;
ALTER TABLE jam_track_plays ENABLE ROW LEVEL SECURITY;
ALTER TABLE jam_reactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE jam_skips      ENABLE ROW LEVEL SECURITY;

-- jams: anyone authenticated can read; only owner can write
CREATE POLICY "jams_select" ON jams
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "jams_insert" ON jams
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "jams_update" ON jams
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "jams_delete" ON jams
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- jam_tracks: anyone authenticated can read; only jam owner can write
CREATE POLICY "jam_tracks_select" ON jam_tracks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "jam_tracks_insert" ON jam_tracks
  FOR INSERT TO authenticated WITH CHECK (
    jam_id IN (SELECT id FROM jams WHERE user_id = auth.uid())
  );

CREATE POLICY "jam_tracks_update" ON jam_tracks
  FOR UPDATE TO authenticated USING (
    jam_id IN (SELECT id FROM jams WHERE user_id = auth.uid())
  );

CREATE POLICY "jam_tracks_delete" ON jam_tracks
  FOR DELETE TO authenticated USING (
    jam_id IN (SELECT id FROM jams WHERE user_id = auth.uid())
  );

-- jam_plays: jam owner can read all plays on their jam; anyone can insert their own
CREATE POLICY "jam_plays_select" ON jam_plays
  FOR SELECT TO authenticated USING (
    listener_id = auth.uid()
    OR jam_id IN (SELECT id FROM jams WHERE user_id = auth.uid())
  );

CREATE POLICY "jam_plays_insert" ON jam_plays
  FOR INSERT TO authenticated WITH CHECK (listener_id = auth.uid());

-- jam_track_plays: jam owner can read; anyone can insert their own
CREATE POLICY "jam_track_plays_select" ON jam_track_plays
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR jam_track_id IN (
      SELECT jt.id FROM jam_tracks jt
      JOIN jams j ON j.id = jt.jam_id
      WHERE j.user_id = auth.uid()
    )
  );

CREATE POLICY "jam_track_plays_insert" ON jam_track_plays
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- jam_reactions: anyone can read; users manage their own
CREATE POLICY "jam_reactions_select" ON jam_reactions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "jam_reactions_insert" ON jam_reactions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "jam_reactions_delete" ON jam_reactions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- jam_skips: jam owner can read all skips; anyone can insert their own
CREATE POLICY "jam_skips_select" ON jam_skips
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR jam_track_id IN (
      SELECT jt.id FROM jam_tracks jt
      JOIN jams j ON j.id = jt.jam_id
      WHERE j.user_id = auth.uid()
    )
  );

CREATE POLICY "jam_skips_insert" ON jam_skips
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ── updated_at trigger ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER jams_updated_at
  BEFORE UPDATE ON jams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
