-- ─── submit_votes RPC ─────────────────────────────────────────────────────────
-- Validates that the caller has spent exactly the season's default_points_per_round
-- before inserting votes, so a partial allocation is rejected at the DB level.
--
-- p_votes: JSON array of { "submission_id": "<uuid>", "points": <int> }

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
  v_points_per_round int;
  v_total_points     int;
BEGIN
  -- Fetch the required point budget for this round
  SELECT s.default_points_per_round
    INTO v_points_per_round
    FROM rounds r
    JOIN seasons s ON s.id = r.season_id
   WHERE r.id = p_round_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found';
  END IF;

  -- Sum the submitted points
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
     WHERE round_id = p_round_id
       AND voter_user_id = p_voter_user_id
  ) THEN
    RAISE EXCEPTION 'You have already voted in this round';
  END IF;

  -- Insert all votes atomically
  INSERT INTO votes (round_id, submission_id, voter_user_id, points)
  SELECT p_round_id,
         (vote->>'submission_id')::uuid,
         p_voter_user_id,
         (vote->>'points')::int
    FROM jsonb_array_elements(p_votes) AS vote;
END;
$$;
