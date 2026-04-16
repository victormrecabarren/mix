-- ─── Submissions per user per round ──────────────────────────────────────────
-- Each season defines how many tracks each user may submit per round.
-- Default is 1 but commissioners commonly use 2+.

ALTER TABLE public.seasons
  ADD COLUMN submissions_per_user int NOT NULL DEFAULT 1;

-- ─── Sequential round enforcement on submissions ──────────────────────────────
-- A submission is only valid when:
--   1. The round's submission window is still open (now < submission_deadline_at)
--   2. The user hasn't exceeded the season's submissions_per_user quota
--   3. The previous round (if any) has fully completed (now >= prev.voting_deadline_at)

CREATE OR REPLACE FUNCTION public.check_submission_eligibility()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  -- Check user hasn't exceeded submissions_per_user limit
  SELECT COUNT(*) INTO v_existing_count
    FROM submissions
    WHERE round_id = NEW.round_id AND user_id = NEW.user_id;

  IF v_existing_count >= v_submissions_per_user THEN
    RAISE EXCEPTION 'You have already submitted the maximum number of tracks for this round (% of %)',
      v_existing_count, v_submissions_per_user;
  END IF;

  -- Previous round must be fully complete before this one opens
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

CREATE TRIGGER enforce_submission_eligibility
  BEFORE INSERT ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.check_submission_eligibility();

-- ─── No overlapping seasons in a league ───────────────────────────────────────
-- A new season cannot be created while any existing season in the same league
-- still has rounds with future voting deadlines.

CREATE OR REPLACE FUNCTION public.check_no_overlapping_season()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM seasons s
      JOIN rounds r ON r.season_id = s.id
      WHERE s.league_id = NEW.league_id
        AND r.voting_deadline_at > now()
  ) THEN
    RAISE EXCEPTION 'A season is already in progress for this league';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_no_overlapping_season
  BEFORE INSERT ON public.seasons
  FOR EACH ROW EXECUTE FUNCTION public.check_no_overlapping_season();
