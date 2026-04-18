-- ─── Auto-close submissions when all members have submitted ──────────────────
-- Mirrors the voting auto-close in submit_votes: when the last member submits
-- their final track, immediately set submission_deadline_at = now() so the
-- app's phase logic flips to VOTING OPEN without waiting for the deadline.
--
-- Uses SECURITY DEFINER so it can UPDATE rounds regardless of RLS (submitters
-- cannot UPDATE rounds directly).

CREATE OR REPLACE FUNCTION public.check_submissions_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league_id      uuid;
  v_subs_per_user  int;
  v_total_members  int;
  v_members_done   int;
BEGIN
  -- Fetch league + required submissions-per-user for this round
  SELECT s.league_id, s.submissions_per_user
    INTO v_league_id, v_subs_per_user
    FROM rounds r
    JOIN seasons s ON s.id = r.season_id
   WHERE r.id = NEW.round_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Total league members
  SELECT COUNT(*) INTO v_total_members
    FROM league_members
   WHERE league_id = v_league_id;

  -- Members who have submitted all required tracks for this round
  SELECT COUNT(*) INTO v_members_done
    FROM (
      SELECT user_id
        FROM submissions
       WHERE round_id = NEW.round_id
      GROUP BY user_id
      HAVING COUNT(*) >= v_subs_per_user
    ) complete;

  -- If everyone is done, close submissions now
  IF v_members_done >= v_total_members THEN
    UPDATE rounds
       SET submission_deadline_at = now()
     WHERE id = NEW.round_id
       AND submission_deadline_at > now();
  END IF;

  RETURN NEW;
END;
$$;

-- Drop if exists so migration is idempotent on re-run
DROP TRIGGER IF EXISTS trg_auto_close_submissions ON public.submissions;

CREATE TRIGGER trg_auto_close_submissions
  AFTER INSERT ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_submissions_complete();
