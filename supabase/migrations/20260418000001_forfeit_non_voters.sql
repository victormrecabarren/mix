-- ─── Forfeit non-voters: implement void logic end-to-end ─────────────────────
-- The initial schema declared round_participants.is_void, votes.is_void, and
-- scheduled a close_voting_rounds() cron job — but the function itself was
-- never defined and round_participants was never populated. This migration
-- fills in the missing pieces so the "must vote to keep your submission
-- points" rule is actually enforced.
--
-- Pieces:
--   1. Triggers on submissions + votes populate round_participants and track
--      voted_at.
--   2. close_voting_rounds() marks round_participants.is_void + votes.is_void
--      for rounds whose voting window has closed.
--   3. assign_playlist_positions() (also referenced by cron but never defined)
--      shuffles playlist_position after submission deadlines.
--   4. submit_votes() invokes close_voting_rounds() after its auto-close so a
--      round that ends early (everyone voted) processes immediately.
--
-- Naming convention for "void": a participant is void when they submitted but
-- failed to vote by the deadline. A vote is void when the submission it
-- targets belongs to a void participant — ghost points remain visible in the
-- UI but are excluded from all point tallies.

-- ─── 1. round_participants population triggers ───────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_round_participant_on_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO round_participants (round_id, user_id)
  VALUES (NEW.round_id, NEW.user_id)
  ON CONFLICT (round_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submission_round_participant ON public.submissions;
CREATE TRIGGER trg_submission_round_participant
  AFTER INSERT ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.upsert_round_participant_on_submission();

CREATE OR REPLACE FUNCTION public.upsert_round_participant_on_vote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO round_participants (round_id, user_id, voted_at)
  VALUES (NEW.round_id, NEW.voter_user_id, now())
  ON CONFLICT (round_id, user_id) DO UPDATE
    SET voted_at = COALESCE(round_participants.voted_at, EXCLUDED.voted_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vote_round_participant ON public.votes;
CREATE TRIGGER trg_vote_round_participant
  AFTER INSERT ON public.votes
  FOR EACH ROW
  EXECUTE FUNCTION public.upsert_round_participant_on_vote();

-- Backfill round_participants for any rounds that already have activity
-- (rounds created before this migration shipped).
INSERT INTO round_participants (round_id, user_id)
SELECT DISTINCT round_id, user_id FROM submissions
ON CONFLICT (round_id, user_id) DO NOTHING;

INSERT INTO round_participants (round_id, user_id, voted_at)
SELECT round_id, voter_user_id, MIN(created_at)
  FROM votes
 GROUP BY round_id, voter_user_id
ON CONFLICT (round_id, user_id) DO UPDATE
  SET voted_at = COALESCE(round_participants.voted_at, EXCLUDED.voted_at);


-- ─── 2. close_voting_rounds: void non-voters + their incoming votes ──────────

CREATE OR REPLACE FUNCTION public.close_voting_rounds()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mark every participant whose voting_deadline has passed without a vote.
  UPDATE round_participants rp
     SET is_void = true
    FROM rounds r
   WHERE rp.round_id = r.id
     AND r.voting_deadline_at <= now()
     AND rp.voted_at IS NULL
     AND rp.is_void = false;

  -- Void every vote whose target submission belongs to a voided submitter.
  -- The vote row stays intact so we can still display ghost points/comments
  -- in the results thread.
  UPDATE votes v
     SET is_void = true
    FROM submissions s
    JOIN round_participants rp
      ON rp.round_id = s.round_id
     AND rp.user_id  = s.user_id
   WHERE v.submission_id = s.id
     AND rp.is_void = true
     AND v.is_void = false;
END;
$$;


-- ─── 3. assign_playlist_positions: shuffle positions after subs close ────────

CREATE OR REPLACE FUNCTION public.assign_playlist_positions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round_id uuid;
BEGIN
  -- Iterate over rounds whose submission window has closed and that still
  -- have any unassigned positions.
  FOR v_round_id IN
    SELECT DISTINCT s.round_id
      FROM submissions s
      JOIN rounds r ON r.id = s.round_id
     WHERE r.submission_deadline_at <= now()
       AND s.playlist_position IS NULL
  LOOP
    WITH shuffled AS MATERIALIZED (
      SELECT id,
             row_number() OVER (ORDER BY random()) AS pos
        FROM submissions
       WHERE round_id = v_round_id
         AND playlist_position IS NULL
    )
    UPDATE submissions s
       SET playlist_position = shuffled.pos
      FROM shuffled
     WHERE s.id = shuffled.id;
  END LOOP;
END;
$$;


-- ─── 4. submit_votes: trigger close_voting_rounds after auto-close ───────────

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
  SELECT s.default_points_per_round, s.league_id
    INTO v_points_per_round, v_league_id
    FROM rounds r
    JOIN seasons s ON s.id = r.season_id
   WHERE r.id = p_round_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found';
  END IF;

  SELECT COALESCE(SUM((vote->>'points')::int), 0)
    INTO v_total_points
    FROM jsonb_array_elements(p_votes) AS vote;

  IF v_total_points <> v_points_per_round THEN
    RAISE EXCEPTION 'You must spend all % points (submitted %)',
      v_points_per_round, v_total_points;
  END IF;

  IF EXISTS (
    SELECT 1 FROM votes
     WHERE round_id = p_round_id
       AND voter_user_id = p_voter_user_id
  ) THEN
    RAISE EXCEPTION 'You have already voted in this round';
  END IF;

  INSERT INTO votes (round_id, submission_id, voter_user_id, points)
  SELECT p_round_id,
         (vote->>'submission_id')::uuid,
         p_voter_user_id,
         (vote->>'points')::int
    FROM jsonb_array_elements(p_votes) AS vote;

  -- Auto-close if everyone has voted
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

    -- Immediately process void logic + playlist positions so results are
    -- consistent without waiting for the next cron tick.
    PERFORM close_voting_rounds();
    PERFORM assign_playlist_positions();
  END IF;
END;
$$;
