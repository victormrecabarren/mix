-- ─── Trigger close_voting_rounds on deadline UPDATEs ────────────────────────
-- Problem: close_voting_rounds() previously only ran on two paths —
--   1. pg_cron every minute (not always running on dev instances)
--   2. submit_votes auto-close (only fires when the LAST voter votes)
-- That left a hole for any path that ends voting another way: the "Force
-- End Voting" UI button, the advance script, or anyone manually bumping
-- voting_deadline_at in the DB. Rounds would flip to "results" without
-- voiding non-voters.
--
-- Fix: a trigger on rounds that fires close_voting_rounds() (and
-- assign_playlist_positions()) whenever the corresponding deadline is
-- updated to a moment in the past. close_voting_rounds/
-- assign_playlist_positions are both idempotent, so extra invocations are
-- safe.

CREATE OR REPLACE FUNCTION public.on_round_deadline_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Submission deadline just became reachable → assign playlist positions.
  IF NEW.submission_deadline_at IS DISTINCT FROM OLD.submission_deadline_at
     AND NEW.submission_deadline_at <= now()
  THEN
    PERFORM assign_playlist_positions();
  END IF;

  -- Voting deadline just became reachable → void non-voters.
  IF NEW.voting_deadline_at IS DISTINCT FROM OLD.voting_deadline_at
     AND NEW.voting_deadline_at <= now()
  THEN
    PERFORM close_voting_rounds();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_round_deadline_update ON public.rounds;
CREATE TRIGGER trg_round_deadline_update
  AFTER UPDATE OF submission_deadline_at, voting_deadline_at ON public.rounds
  FOR EACH ROW
  EXECUTE FUNCTION public.on_round_deadline_update();
