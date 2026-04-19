-- ─── Block spectators from submitting ────────────────────────────────────────
-- RLS alone doesn't protect against service-role inserts (used by test scripts
-- and server-side code). A BEFORE INSERT trigger fires unconditionally and
-- provides a hard guarantee that spectators can never have submissions.

CREATE OR REPLACE FUNCTION public.check_submission_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league_id uuid;
  v_role      text;
BEGIN
  -- Resolve the league for this round
  SELECT s.league_id INTO v_league_id
    FROM rounds r
    JOIN seasons s ON s.id = r.season_id
   WHERE r.id = NEW.round_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found';
  END IF;

  -- Look up the submitter's role in this league
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

DROP TRIGGER IF EXISTS trg_check_submission_eligibility ON public.submissions;

CREATE TRIGGER trg_check_submission_eligibility
  BEFORE INSERT ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_submission_eligibility();
