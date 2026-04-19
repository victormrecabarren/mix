-- ─── Non-submitter vote guard + eligible-voter auto-close ────────────────────
-- Two bugs fixed:
--   1. Players who did not submit a track were able to call submit_votes and
--      have their points counted. Now rejected at the DB level.
--   2. Auto-close compared total voters against ALL league members. If a
--      non-submitter voted first, the round would never auto-close because the
--      count of actual voters could never reach total_members once we block them.
--      Now auto-close compares against the count of DISTINCT submitters for
--      this round (the only eligible voters).

CREATE OR REPLACE FUNCTION public.submit_votes(
  p_round_id       uuid,
  p_voter_user_id  uuid,
  p_votes          jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points_per_round     int;
  v_total_points         int;
  v_league_id            uuid;
  v_eligible_voter_count int;
  v_total_voters         int;
BEGIN
  SELECT s.default_points_per_round, s.league_id
    INTO v_points_per_round, v_league_id
    FROM rounds r
    JOIN seasons s ON s.id = r.season_id
   WHERE r.id = p_round_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found';
  END IF;

  -- Only players who submitted at least one track in this round may vote.
  IF NOT EXISTS (
    SELECT 1 FROM submissions
     WHERE round_id = p_round_id
       AND user_id  = p_voter_user_id
  ) THEN
    RAISE EXCEPTION 'You did not submit a track in this round and are not eligible to vote';
  END IF;

  -- Validate point total
  SELECT COALESCE(SUM((vote->>'points')::int), 0)
    INTO v_total_points
    FROM jsonb_array_elements(p_votes) AS vote;

  IF v_total_points <> v_points_per_round THEN
    RAISE EXCEPTION 'You must spend all % points (submitted %)',
      v_points_per_round, v_total_points;
  END IF;

  -- Guard against double-voting
  IF EXISTS (
    SELECT 1 FROM votes
     WHERE round_id      = p_round_id
       AND voter_user_id = p_voter_user_id
  ) THEN
    RAISE EXCEPTION 'You have already voted in this round';
  END IF;

  -- Insert votes atomically
  INSERT INTO votes (round_id, submission_id, voter_user_id, points)
  SELECT p_round_id,
         (vote->>'submission_id')::uuid,
         p_voter_user_id,
         (vote->>'points')::int
    FROM jsonb_array_elements(p_votes) AS vote;

  -- Auto-close: compare against submitters only (the eligible voter pool).
  -- A non-submitter is not eligible, so they should never count toward the
  -- "everyone has voted" threshold.
  SELECT COUNT(DISTINCT user_id) INTO v_eligible_voter_count
    FROM submissions
   WHERE round_id = p_round_id;

  SELECT COUNT(DISTINCT voter_user_id) INTO v_total_voters
    FROM votes
   WHERE round_id = p_round_id;

  IF v_total_voters >= v_eligible_voter_count THEN
    UPDATE rounds
       SET voting_deadline_at = now()
     WHERE id = p_round_id;

    -- Immediately run void + playlist position logic without waiting for cron.
    PERFORM close_voting_rounds();
    PERFORM assign_playlist_positions();
  END IF;
END;
$$;
