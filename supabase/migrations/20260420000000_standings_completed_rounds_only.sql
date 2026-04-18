-- ─── Season standings: closed rounds only + all league members ──────────────
-- Points only count after a round's voting_deadline_at (same as "round ended"
-- for scoring). In-flight votes never affect the leaderboard.
--
-- Also joins every league member so spectators and zero-point players appear.
-- Forfeiture: same as scoring RPC — exclude received points when the submitter
-- never cast a vote in that round (EXISTS voter rows), even if is_void lagged.

DROP FUNCTION IF EXISTS public.get_season_standings(uuid);

CREATE OR REPLACE FUNCTION public.get_season_standings(p_season_id uuid)
RETURNS TABLE (
  user_id            uuid,
  display_name       text,
  total_points       int,
  rounds_played      int,
  rounds_forfeited   int,
  member_role        text
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
               AND rr.voting_deadline_at <= now()
               AND EXISTS (
                 SELECT 1
                   FROM votes vc
                  WHERE vc.round_id = s.round_id
                    AND vc.voter_user_id = s.user_id
               )
           ), 0)::int AS total_points
      FROM submissions s
      JOIN rounds rr ON rr.id = s.round_id AND rr.season_id = p_season_id
      LEFT JOIN votes v ON v.submission_id = s.id
     GROUP BY s.user_id
  ),
  participation AS (
    SELECT rp.user_id,
           COUNT(*) FILTER (
             WHERE rp.voted_at IS NOT NULL
               AND EXISTS (
                 SELECT 1 FROM rounds r2
                  WHERE r2.id = rp.round_id
                    AND r2.voting_deadline_at <= now()
               )
           )::int AS rounds_played,
           COUNT(*) FILTER (
             WHERE rp.is_void = true
               AND EXISTS (
                 SELECT 1 FROM rounds r2
                  WHERE r2.id = rp.round_id
                    AND r2.voting_deadline_at <= now()
               )
           )::int AS rounds_forfeited
      FROM round_participants rp
     WHERE rp.round_id IN (SELECT id FROM season_rounds)
     GROUP BY rp.user_id
  ),
  members AS (
    SELECT lm.user_id, lm.role AS member_role
      FROM league_members lm
      JOIN seasons s ON s.league_id = lm.league_id AND s.id = p_season_id
  )
  SELECT m.user_id,
         COALESCE(u.display_name, 'Unknown') AS display_name,
         COALESCE(t.total_points, 0) AS total_points,
         COALESCE(p.rounds_played, 0) AS rounds_played,
         COALESCE(p.rounds_forfeited, 0) AS rounds_forfeited,
         m.member_role
    FROM members m
    LEFT JOIN users u ON u.id = m.user_id
    LEFT JOIN totals t ON t.user_id = m.user_id
    LEFT JOIN participation p ON p.user_id = m.user_id
   ORDER BY COALESCE(t.total_points, 0) DESC, display_name ASC;
$$;
