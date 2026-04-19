-- ─── Fix: restore original check_submission_eligibility ──────────────────────
-- Migration 20260421000001 renamed the spectator guard to
-- check_submission_eligibility(), which silently replaced the original function
-- of the same name (deadline + quota + sequential-round checks). Those checks
-- are now missing. This migration:
--   1. Restores the full original check_submission_eligibility().
--   2. Renames the spectator guard to check_spectator_submission_eligibility()
--      and updates its trigger accordingly.

-- ─── 1. Restore the original deadline + quota + sequential-round check ────────

CREATE OR REPLACE FUNCTION public.check_submission_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id            uuid;
  v_round_number         int;
  v_sub_deadline         timestamptz;
  v_prev_vote_deadline   timestamptz;
  v_submissions_per_user int;
  v_existing_count       int;
BEGIN
  SELECT r.season_id, r.round_number, r.submission_deadline_at,
         s.submissions_per_user
    INTO v_season_id, v_round_number, v_sub_deadline, v_submissions_per_user
    FROM rounds r
    JOIN seasons s ON s.id = r.season_id
   WHERE r.id = NEW.round_id;

  -- Submission window must still be open
  IF now() >= v_sub_deadline THEN
    RAISE EXCEPTION 'Submission deadline has passed for this round';
  END IF;

  -- User hasn't exceeded submissions_per_user limit
  SELECT COUNT(*) INTO v_existing_count
    FROM submissions
   WHERE round_id = NEW.round_id AND user_id = NEW.user_id;

  IF v_existing_count >= v_submissions_per_user THEN
    RAISE EXCEPTION 'You have already submitted the maximum number of tracks for this round (% of %)',
      v_existing_count, v_submissions_per_user;
  END IF;

  -- Previous round must be fully complete
  IF v_round_number > 1 THEN
    SELECT voting_deadline_at INTO v_prev_vote_deadline
      FROM rounds
     WHERE season_id = v_season_id
       AND round_number = v_round_number - 1;

    IF FOUND AND now() < v_prev_vote_deadline THEN
      RAISE EXCEPTION 'Previous round is still in progress';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 2. Rename spectator guard to its own function ────────────────────────────

CREATE OR REPLACE FUNCTION public.check_spectator_submission_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league_id uuid;
  v_role      text;
BEGIN
  SELECT s.league_id INTO v_league_id
    FROM rounds r
    JOIN seasons s ON s.id = r.season_id
   WHERE r.id = NEW.round_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found';
  END IF;

  SELECT role INTO v_role
    FROM league_members
   WHERE league_id = v_league_id
     AND user_id   = NEW.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not a member of this league';
  END IF;

  IF v_role = 'spectator' THEN
    RAISE EXCEPTION 'Spectators cannot submit tracks';
  END IF;

  RETURN NEW;
END;
$$;

-- Update the trigger to call the correctly named function
DROP TRIGGER IF EXISTS trg_check_submission_eligibility ON public.submissions;

CREATE TRIGGER trg_check_submission_eligibility
  BEFORE INSERT ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_spectator_submission_eligibility();
