-- ─── Constrained playlist shuffle ────────────────────────────────────────────
-- Replaces the simple ORDER BY random() shuffle in assign_playlist_positions()
-- with a greedy no-adjacent-duplicates algorithm that also enforces:
--
--   Rule 1 – No same-user first+last: if a user has 2+ tracks in a round,
--             their track cannot occupy both position 1 AND position N.
--   Rule 2 – No back-to-back: positions i and i+1 cannot belong to the same
--             user.
--   Rule 3 – No first/last repeat from previous round: a user whose track held
--             position 1 or position N in round_number-1 (same season) may not
--             occupy position 1 or position N in the current round.
--
-- All three rules are applied only when numerically possible.  If enforcing a
-- rule would make a valid ordering impossible the rule is relaxed gracefully.
--
-- Algorithm (per round):
--   1. Load all unassigned submissions as (sub_id, user_id).
--   2. Determine prev_endpoint_users from round_number-1 in the same season —
--      users who held position 1 or position N there.
--   3. Build a frequency table: user_id → remaining track count.  Assign a
--      random tiebreak to each submission, fixed for the whole run.
--   4. Greedy placement loop for position 1..N:
--        Pass A – full constraints (Rule 2 + Rule 3 at endpoints).
--        Pass B – relax Rule 3 only (keep Rule 2).
--        Pass C – relax everything (fallback for degenerate inputs).
--      Tracks are chosen by (remaining DESC, tiebreak) so heavily-used users
--      are spread out first, with randomness among equals.
--   5. Post-processing: if positions 1 and N share the same user_id (Rule 1
--      violation) and there exists an interior track with a different user,
--      swap that interior track into position N.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assign_playlist_positions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- outer loop
  v_round_id            uuid;
  v_season_id           uuid;
  v_round_number        int;
  v_prev_round_id       uuid;
  v_total               int;
  v_prev_endpoint_users uuid[];

  -- greedy placement
  v_pos                 int;
  v_chosen_sub_id       uuid;
  v_chosen_user_id      uuid;
  v_last_user           uuid;

  -- Rule-1 post-processing
  v_first_sub_id        uuid;
  v_first_user_id       uuid;
  v_last_sub_id         uuid;
  v_last_user_id        uuid;
  v_swap_sub_id         uuid;
  v_swap_user_id        uuid;
  v_swap_pos            int;
BEGIN

  -- ── Outer loop: every round with at least one unassigned position ─────────
  FOR v_round_id IN
    SELECT DISTINCT s.round_id
      FROM submissions s
      JOIN rounds r ON r.id = s.round_id
     WHERE r.submission_deadline_at <= now()
       AND s.playlist_position IS NULL
  LOOP

    -- ── 0. Round metadata ─────────────────────────────────────────────────
    SELECT r.season_id, r.round_number
      INTO v_season_id, v_round_number
      FROM rounds r
     WHERE r.id = v_round_id;

    SELECT COUNT(*)
      INTO v_total
      FROM submissions
     WHERE round_id         = v_round_id
       AND playlist_position IS NULL;

    IF v_total = 0 THEN
      CONTINUE;
    END IF;

    -- ── 1. Rule 3: previous-round endpoint users ──────────────────────────
    v_prev_endpoint_users := ARRAY[]::uuid[];

    SELECT r2.id
      INTO v_prev_round_id
      FROM rounds r2
     WHERE r2.season_id    = v_season_id
       AND r2.round_number = v_round_number - 1
     LIMIT 1;

    IF v_prev_round_id IS NOT NULL THEN
      SELECT ARRAY_AGG(DISTINCT s.user_id)
        INTO v_prev_endpoint_users
        FROM submissions s
       WHERE s.round_id         = v_prev_round_id
         AND s.playlist_position IS NOT NULL
         AND s.playlist_position IN (
               1,
               (SELECT MAX(s2.playlist_position)
                  FROM submissions s2
                 WHERE s2.round_id = v_prev_round_id)
             );
    END IF;

    IF v_prev_endpoint_users IS NULL THEN
      v_prev_endpoint_users := ARRAY[]::uuid[];
    END IF;

    -- ── 2. Build temp heap (one row per unassigned submission) ────────────
    --
    -- remaining  = count of this user's tracks not yet placed (initialized to
    --              their total submission count for this round).
    -- tiebreak   = random value assigned once and kept stable through the loop
    --              so the ORDER BY is reproducible within a single call but
    --              different each invocation.

    DROP TABLE IF EXISTS _pp_heap;
    CREATE TEMP TABLE _pp_heap (
      sub_id    uuid             NOT NULL,
      user_id   uuid             NOT NULL,
      remaining int              NOT NULL,
      tiebreak  double precision NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO _pp_heap (sub_id, user_id, remaining, tiebreak)
    SELECT s.id,
           s.user_id,
           COUNT(*) OVER (PARTITION BY s.user_id)::int,
           random()
      FROM submissions s
     WHERE s.round_id         = v_round_id
       AND s.playlist_position IS NULL;

    -- ── 3. Build temp result table ────────────────────────────────────────

    DROP TABLE IF EXISTS _pp_placed;
    CREATE TEMP TABLE _pp_placed (
      pos     int  NOT NULL,
      sub_id  uuid NOT NULL,
      user_id uuid NOT NULL
    ) ON COMMIT DROP;

    -- ── 4. Greedy placement ───────────────────────────────────────────────

    v_last_user := NULL;

    FOR v_pos IN 1..v_total LOOP

      v_chosen_sub_id  := NULL;
      v_chosen_user_id := NULL;

      -- Pass A: full constraints
      --   • Rule 2: user_id != last placed user
      --   • Rule 3: at endpoint positions, avoid prev_endpoint_users
      SELECT h.sub_id, h.user_id
        INTO v_chosen_sub_id, v_chosen_user_id
        FROM _pp_heap h
       WHERE (
               v_last_user IS NULL
               OR h.user_id <> v_last_user          -- Rule 2
             )
         AND (
               -- Rule 3 only applies at positions 1 and N
               (v_pos NOT IN (1, v_total))
            OR NOT (h.user_id = ANY(v_prev_endpoint_users))
             )
       ORDER BY h.remaining DESC,
                h.tiebreak
       LIMIT 1;

      -- Pass B: relax Rule 3, keep Rule 2
      IF v_chosen_sub_id IS NULL THEN
        SELECT h.sub_id, h.user_id
          INTO v_chosen_sub_id, v_chosen_user_id
          FROM _pp_heap h
         WHERE (
                 v_last_user IS NULL
                 OR h.user_id <> v_last_user
               )
         ORDER BY h.remaining DESC,
                  h.tiebreak
         LIMIT 1;
      END IF;

      -- Pass C: relax everything (single-user edge case)
      IF v_chosen_sub_id IS NULL THEN
        SELECT h.sub_id, h.user_id
          INTO v_chosen_sub_id, v_chosen_user_id
          FROM _pp_heap h
         ORDER BY h.remaining DESC,
                  h.tiebreak
         LIMIT 1;
      END IF;

      -- Record placement.
      INSERT INTO _pp_placed (pos, sub_id, user_id)
      VALUES (v_pos, v_chosen_sub_id, v_chosen_user_id);

      v_last_user := v_chosen_user_id;

      -- Decrement remaining count for this user across all their heap rows.
      UPDATE _pp_heap
         SET remaining = remaining - 1
       WHERE user_id = v_chosen_user_id;

      -- Remove the chosen submission from the heap.
      DELETE FROM _pp_heap
       WHERE sub_id = v_chosen_sub_id;

    END LOOP; -- placement

    -- ── 5. Post-processing: Rule 1 (no same-user at pos 1 AND pos N) ─────

    IF v_total >= 2 THEN

      SELECT p.sub_id, p.user_id
        INTO v_first_sub_id, v_first_user_id
        FROM _pp_placed p
       WHERE p.pos = 1;

      SELECT p.sub_id, p.user_id
        INTO v_last_sub_id, v_last_user_id
        FROM _pp_placed p
       WHERE p.pos = v_total;

      IF v_first_user_id = v_last_user_id THEN
        -- Look for an interior track with a different user to swap into pos N.
        SELECT p.pos, p.sub_id, p.user_id
          INTO v_swap_pos, v_swap_sub_id, v_swap_user_id
          FROM _pp_placed p
         WHERE p.pos > 1
           AND p.pos < v_total
           AND p.user_id <> v_first_user_id
         ORDER BY random()
         LIMIT 1;

        IF v_swap_sub_id IS NOT NULL THEN
          -- Swap: interior track → pos N, current pos-N track → interior pos.
          -- Use a two-step delete+insert to avoid any transient constraint issues.
          DELETE FROM _pp_placed
           WHERE pos IN (v_swap_pos, v_total);

          INSERT INTO _pp_placed (pos, sub_id, user_id) VALUES
            (v_total,    v_swap_sub_id,  v_swap_user_id),
            (v_swap_pos, v_last_sub_id,  v_last_user_id);
        END IF;
        -- If no interior candidate exists (e.g. only 2 positions, both same
        -- user) Rule 1 cannot be satisfied — leave as-is.

      END IF;
    END IF;

    -- ── 6. Write final positions to submissions ───────────────────────────

    UPDATE submissions s
       SET playlist_position = p.pos
      FROM _pp_placed p
     WHERE s.id = p.sub_id;

  END LOOP; -- round loop

END;
$$;
