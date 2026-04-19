-- ─── Submission auto-close: count participants only ──────────────────────────
-- Previous version counted ALL league_members, so any league with a spectator
-- would never auto-close submissions: spectators can't submit (blocked by
-- check_submission_eligibility) so v_members_done could never reach
-- v_total_members. Mirrors the vote auto-close fix in
-- 20260421000000_non_submitter_vote_guard.sql — compare against the eligible
-- submitter pool, not the full membership.

CREATE OR REPLACE FUNCTION public.check_submissions_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league_id          uuid;
  v_subs_per_user      int;
  v_total_participants int;
  v_members_done       int;
BEGIN
  SELECT s.league_id, s.submissions_per_user
    INTO v_league_id, v_subs_per_user
    FROM rounds r
    JOIN seasons s ON s.id = r.season_id
   WHERE r.id = NEW.round_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Participants only — spectators are blocked from submitting, so they must
  -- not count toward the completion threshold.
  SELECT COUNT(*) INTO v_total_participants
    FROM league_members
   WHERE league_id = v_league_id
     AND role      = 'participant';

  SELECT COUNT(*) INTO v_members_done
    FROM (
      SELECT user_id
        FROM submissions
       WHERE round_id = NEW.round_id
      GROUP BY user_id
      HAVING COUNT(*) >= v_subs_per_user
    ) complete;

  IF v_members_done >= v_total_participants THEN
    UPDATE rounds
       SET submission_deadline_at = now()
     WHERE id = NEW.round_id
       AND submission_deadline_at > now();
  END IF;

  RETURN NEW;
END;
$$;
