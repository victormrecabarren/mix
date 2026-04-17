-- ─── submit_votes v2: auto-close round when all members have voted ─────────────
-- The previous version validated point totals and inserted votes.
-- This version adds an auto-close check inside the same SECURITY DEFINER
-- function so it can UPDATE rounds regardless of RLS (voters cannot UPDATE
-- rounds directly — only the league admin can).

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
  v_league_id        uuid;
  v_total_members    int;
  v_total_voters     int;
BEGIN
  -- Fetch the required point budget and league for this round
  SELECT s.default_points_per_round, s.league_id
    INTO v_points_per_round, v_league_id
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

  -- Auto-close: if every league member has now voted, end voting immediately.
  -- Runs inside SECURITY DEFINER so RLS on rounds is bypassed.
  SELECT COUNT(*) INTO v_total_members
    FROM league_members
   WHERE league_id = v_league_id;

  SELECT COUNT(DISTINCT voter_user_id) INTO v_total_voters
    FROM votes
   WHERE round_id = p_round_id;

  IF v_total_voters >= v_total_members THEN
    UPDATE rounds
       SET voting_deadline_at = now()
     WHERE id = p_round_id;
  END IF;
END;
$$;
