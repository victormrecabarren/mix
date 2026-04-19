-- ─── Forfeit rule: source of truth = did the submitter cast a vote? ──────────
-- get_round_results previously relied on round_participants.is_void. If that
-- row was missing (submissions inserted before triggers shipped, failed
-- backfill, etc.), COALESCE(rp.is_void, false) treated the player as
-- eligible and they could still rank first despite never voting.
--
-- This migration:
--   1. Rewrites get_round_results so void / effective points derive from
--      "past voting_deadline AND no votes row as voter for this round",
--      with round_participants only as a secondary signal.
--   2. Rewrites close_voting_rounds to void incoming votes using the same
--      rule (not only rp.is_void), so votes.is_void stays consistent even
--      without a round_participants row.
--   3. Rewrites get_season_standings so season totals exclude ghost points
--      unless the submitter voted OR the round is still open for voting.

CREATE OR REPLACE FUNCTION public.close_voting_rounds()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Bookkeeping: participants who never voted
  UPDATE round_participants rp
     SET is_void = true
    FROM rounds r
   WHERE rp.round_id = r.id
     AND r.voting_deadline_at <= now()
     AND rp.voted_at IS NULL
     AND rp.is_void = false;

  -- Void every vote targeting a submission whose author did not participate
  -- in voting for this round, once the deadline has passed. Covers missing
  -- round_participants rows and matches the app-facing forfeit rule.
  UPDATE votes v
     SET is_void = true
    FROM submissions s
    JOIN rounds r ON r.id = s.round_id
    LEFT JOIN round_participants rp
      ON rp.round_id = s.round_id
     AND rp.user_id = s.user_id
   WHERE v.submission_id = s.id
     AND v.round_id = s.round_id
     AND r.voting_deadline_at <= now()
     AND v.is_void = false
     AND (
       rp.is_void = true
       OR NOT EXISTS (
         SELECT 1
           FROM votes vcast
          WHERE vcast.round_id = s.round_id
            AND vcast.voter_user_id = s.user_id
       )
     );
END;
$$;


CREATE OR REPLACE FUNCTION public.get_round_results(p_round_id uuid)
RETURNS TABLE (
  submission_id     uuid,
  user_id           uuid,
  display_name      text,
  track_title       text,
  track_artist      text,
  track_artwork_url text,
  spotify_track_id  text,
  track_isrc        text,
  points_raw        int,
  points_effective  int,
  is_void           boolean,
  sort_key          int
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH rnd AS (
    SELECT voting_deadline_at FROM rounds WHERE id = p_round_id
  ),
  totals_raw AS (
    SELECT v.submission_id,
           COALESCE(SUM(v.points), 0)::int AS points_raw
      FROM votes v
     WHERE v.round_id = p_round_id
     GROUP BY v.submission_id
  ),
  totals_eff AS (
    SELECT v.submission_id,
           COALESCE(SUM(v.points) FILTER (WHERE v.is_void = false), 0)::int AS pts_eff
      FROM votes v
     WHERE v.round_id = p_round_id
     GROUP BY v.submission_id
  ),
  rows AS (
    SELECT
      s.id AS submission_id,
      s.user_id AS uid,
      COALESCE(u.display_name, 'Unknown') AS disp,
      s.track_title AS tt,
      s.track_artist AS ta,
      s.track_artwork_url AS tau,
      s.spotify_track_id AS stid,
      s.track_isrc AS isrc,
      COALESCE(tr.points_raw, 0) AS pr,
      COALESCE(te.pts_eff, 0) AS pe,
      CASE
        WHEN NOT EXISTS (SELECT 1 FROM rnd)
          THEN false
        WHEN (SELECT now() >= voting_deadline_at FROM rnd)
             AND NOT EXISTS (
               SELECT 1
                 FROM votes vc
                WHERE vc.round_id = p_round_id
                  AND vc.voter_user_id = s.user_id
             )
          THEN true
        WHEN COALESCE(rp.is_void, false)
          THEN true
        ELSE false
      END AS forfeited
    FROM submissions s
    LEFT JOIN totals_raw tr ON tr.submission_id = s.id
    LEFT JOIN totals_eff te ON te.submission_id = s.id
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN round_participants rp
      ON rp.round_id = s.round_id
     AND rp.user_id = s.user_id
   WHERE s.round_id = p_round_id
  )
  SELECT r.submission_id,
         r.uid,
         r.disp,
         r.tt,
         r.ta,
         r.tau,
         r.stid,
         r.isrc,
         r.pr,
         CASE WHEN r.forfeited THEN 0 ELSE r.pe END,
         r.forfeited,
         CASE WHEN r.forfeited THEN 1 ELSE 0 END * 1000000 - r.pr
    FROM rows r
   ORDER BY
     CASE WHEN r.forfeited THEN 1 ELSE 0 END,
     r.pr DESC,
     r.submission_id;
$$;


CREATE OR REPLACE FUNCTION public.get_season_standings(p_season_id uuid)
RETURNS TABLE (
  user_id            uuid,
  display_name       text,
  total_points       int,
  rounds_played      int,
  rounds_forfeited   int
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH season_rounds AS (
    SELECT id FROM rounds WHERE season_id = p_season_id
  ),
  totals AS (
    SELECT s.user_id,
           COALESCE(SUM(v.points) FILTER (
             WHERE v.is_void = false
               AND (
                 EXISTS (
                   SELECT 1 FROM votes vp
                    WHERE vp.round_id = s.round_id
                      AND vp.voter_user_id = s.user_id
                 )
                 OR EXISTS (
                   SELECT 1 FROM rounds rr
                    WHERE rr.id = s.round_id
                      AND rr.voting_deadline_at > now()
                 )
               )
           ), 0)::int AS total_points
      FROM submissions s
      JOIN season_rounds sr ON sr.id = s.round_id
      LEFT JOIN votes v ON v.submission_id = s.id
     GROUP BY s.user_id
  ),
  participation AS (
    SELECT rp.user_id,
           COUNT(*) FILTER (WHERE rp.voted_at IS NOT NULL)::int AS rounds_played,
           COUNT(*) FILTER (WHERE rp.is_void = true)::int AS rounds_forfeited
      FROM round_participants rp
      JOIN season_rounds sr ON sr.id = rp.round_id
     GROUP BY rp.user_id
  ),
  all_users AS (
    SELECT user_id FROM totals
    UNION
    SELECT user_id FROM participation
  )
  SELECT au.user_id,
         COALESCE(u.display_name, 'Unknown') AS display_name,
         COALESCE(t.total_points, 0) AS total_points,
         COALESCE(p.rounds_played, 0) AS rounds_played,
         COALESCE(p.rounds_forfeited, 0) AS rounds_forfeited
    FROM all_users au
    LEFT JOIN users u ON u.id = au.user_id
    LEFT JOIN totals t ON t.user_id = au.user_id
    LEFT JOIN participation p ON p.user_id = au.user_id
   ORDER BY total_points DESC, display_name ASC;
$$;
