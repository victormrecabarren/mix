-- ─── Season auto-complete ─────────────────────────────────────────────────────
-- When the last round in a season has its voting closed, mark the season as
-- completed. Fires from close_voting_rounds() which is already called after
-- every submit_votes auto-close and every cron tick.
--
-- Also:
--   1. Block adding rounds to a completed season (BEFORE INSERT trigger).
--   2. Block editing a completed season's core fields (BEFORE UPDATE trigger).
--   3. Extend get_join_invite_info to return season_status so the client can
--      show a "season has ended" error instead of an invite form.

-- ─── 1. complete_finished_seasons() helper ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.complete_finished_seasons()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE seasons s
     SET status      = 'completed',
         completed_at = now()
   WHERE s.status = 'active'
     AND NOT EXISTS (
       -- Season is finished when every round's voting window has closed
       SELECT 1
         FROM rounds r
        WHERE r.season_id = s.id
          AND r.voting_deadline_at > now()
     )
     AND EXISTS (
       -- Must have at least one round (don't auto-complete empty seasons)
       SELECT 1 FROM rounds r WHERE r.season_id = s.id
     );
END;
$$;

-- ─── 2. Wire complete_finished_seasons into close_voting_rounds ───────────────

CREATE OR REPLACE FUNCTION public.close_voting_rounds()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mark every participant whose voting_deadline has passed without a vote.
  UPDATE round_participants rp
     SET is_void = true
    FROM rounds r
   WHERE rp.round_id = r.id
     AND r.voting_deadline_at <= now()
     AND rp.voted_at IS NULL
     AND rp.is_void = false;

  -- Void every vote whose target submission belongs to a voided submitter.
  UPDATE votes v
     SET is_void = true
    FROM submissions s
    JOIN round_participants rp
      ON rp.round_id = s.round_id
     AND rp.user_id  = s.user_id
   WHERE v.submission_id = s.id
     AND rp.is_void = true
     AND v.is_void = false;

  -- Mark any seasons whose last round has now closed.
  PERFORM complete_finished_seasons();
END;
$$;

-- ─── 3. Block adding rounds to a completed season ─────────────────────────────

CREATE OR REPLACE FUNCTION public.check_season_not_completed_on_round_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM seasons WHERE id = NEW.season_id;
  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'Cannot add rounds to a completed season';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_round_on_completed_season ON public.rounds;

CREATE TRIGGER trg_block_round_on_completed_season
  BEFORE INSERT ON public.rounds
  FOR EACH ROW
  EXECUTE FUNCTION public.check_season_not_completed_on_round_insert();

-- ─── 4. Block editing a completed season ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_season_not_completed_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow status transitions (active → completed is what we set above).
  -- Block all other edits to completed seasons.
  IF OLD.status = 'completed' AND NEW.status = 'completed' THEN
    RAISE EXCEPTION 'Cannot edit a completed season';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_edit_completed_season ON public.seasons;

CREATE TRIGGER trg_block_edit_completed_season
  BEFORE UPDATE ON public.seasons
  FOR EACH ROW
  EXECUTE FUNCTION public.check_season_not_completed_on_update();

-- ─── 5. get_join_invite_info: include season_status ──────────────────────────

DROP FUNCTION IF EXISTS public.get_join_invite_info(uuid);

CREATE OR REPLACE FUNCTION public.get_join_invite_info(invite_token uuid)
RETURNS TABLE (
  season_id     uuid,
  season_name   text,
  season_status text,
  league_id     uuid,
  league_name   text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    s.id          AS season_id,
    s.name        AS season_name,
    s.status      AS season_status,
    l.id          AS league_id,
    l.name        AS league_name
  FROM public.seasons s
  JOIN public.leagues l ON l.id = s.league_id
  WHERE s.invite_token = get_join_invite_info.invite_token;
$$;

-- ─── 6. Backfill: complete any seasons that are already finished ──────────────
SELECT complete_finished_seasons();
