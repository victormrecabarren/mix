-- ─── Results & standings RPCs ────────────────────────────────────────────────
-- Exposes two SECURITY INVOKER functions the mobile app queries instead of
-- summing raw votes. Both apply the forfeit rule: a submission whose author
-- did not vote by the deadline has all its received points excluded from
-- totals but still listed so ghost points remain visible in the UI.
--
-- get_round_results(p_round_id):
--   Per-submission row with submitter info, raw points received, forfeit
--   flag, and effective points (0 when forfeited). Ordering key pushes
--   forfeits to the bottom.
--
-- get_season_standings(p_season_id):
--   Per-user season totals summing only non-void votes received, plus counts
--   for rounds played / rounds forfeited.

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
  WITH totals AS (
    SELECT v.submission_id,
           COALESCE(SUM(v.points), 0)::int AS points_raw
      FROM votes v
     WHERE v.round_id = p_round_id
     GROUP BY v.submission_id
  )
  SELECT s.id               AS submission_id,
         s.user_id           AS user_id,
         COALESCE(u.display_name, 'Unknown') AS display_name,
         s.track_title,
         s.track_artist,
         s.track_artwork_url,
         s.spotify_track_id,
         s.track_isrc,
         COALESCE(t.points_raw, 0)                              AS points_raw,
         CASE WHEN rp.is_void THEN 0 ELSE COALESCE(t.points_raw, 0) END
                                                                AS points_effective,
         COALESCE(rp.is_void, false)                            AS is_void,
         -- Sort key: non-void first, then void. Within each group, points desc.
         CASE WHEN rp.is_void THEN 1 ELSE 0 END * 1000000
           - COALESCE(t.points_raw, 0)                           AS sort_key
    FROM submissions s
    LEFT JOIN totals              t  ON t.submission_id = s.id
    LEFT JOIN users               u  ON u.id            = s.user_id
    LEFT JOIN round_participants  rp ON rp.round_id     = s.round_id
                                     AND rp.user_id     = s.user_id
   WHERE s.round_id = p_round_id
   ORDER BY sort_key, s.id;
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
           COALESCE(SUM(v.points) FILTER (WHERE v.is_void = false), 0)::int AS total_points
      FROM submissions s
      JOIN season_rounds r ON r.id = s.round_id
      LEFT JOIN votes v ON v.submission_id = s.id
     GROUP BY s.user_id
  ),
  participation AS (
    SELECT rp.user_id,
           COUNT(*) FILTER (WHERE rp.voted_at IS NOT NULL)::int AS rounds_played,
           COUNT(*) FILTER (WHERE rp.is_void = true)::int       AS rounds_forfeited
      FROM round_participants rp
      JOIN season_rounds r ON r.id = rp.round_id
     GROUP BY rp.user_id
  ),
  all_users AS (
    SELECT user_id FROM totals
    UNION
    SELECT user_id FROM participation
  )
  SELECT au.user_id,
         COALESCE(u.display_name, 'Unknown')     AS display_name,
         COALESCE(t.total_points, 0)             AS total_points,
         COALESCE(p.rounds_played, 0)            AS rounds_played,
         COALESCE(p.rounds_forfeited, 0)         AS rounds_forfeited
    FROM all_users au
    LEFT JOIN users u ON u.id = au.user_id
    LEFT JOIN totals t ON t.user_id = au.user_id
    LEFT JOIN participation p ON p.user_id = au.user_id
   ORDER BY total_points DESC, display_name ASC;
$$;


GRANT EXECUTE ON FUNCTION public.get_round_results(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_season_standings(uuid)  TO authenticated;
