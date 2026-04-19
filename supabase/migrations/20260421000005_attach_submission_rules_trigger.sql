-- ─── Re-attach submission rules trigger ──────────────────────────────────────
-- Migration 20260421000003 restored check_submission_eligibility() (deadline,
-- quota, sequential-round checks) but left it orphaned: the trigger named
-- trg_check_submission_eligibility was pointed at the spectator guard, and no
-- trigger was attached to the restored function.
--
-- This adds a second BEFORE INSERT trigger under a distinct name so both
-- enforcement paths run. Alphabetical fire order puts the spectator check
-- first (trg_check_submission_eligibility) then the rules check
-- (trg_check_submission_rules), giving spectators a clearer error before
-- they hit deadline/quota/sequential logic.

DROP TRIGGER IF EXISTS trg_check_submission_rules ON public.submissions;

CREATE TRIGGER trg_check_submission_rules
  BEFORE INSERT ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_submission_eligibility();
