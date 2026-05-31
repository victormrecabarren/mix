-- ─────────────────────────────────────────────────────────────────────────────
-- Deadline extension voting v2
-- ─────────────────────────────────────────────────────────────────────────────
-- Issue #24: participants can request an extension for the active round phase.
-- Defaults are intentionally permissive for MVP:
--   - 33% of eligible participants, rounded up
--   - 24 hour extension duration
--   - unlimited extensions per phase, bounded by timeline hard walls
--
-- The hard wall is the true upper limit: submission extensions cannot pass the
-- same round's voting deadline, and voting extensions cannot pass the next
-- round's submission deadline.

ALTER TABLE public.seasons
  ADD COLUMN IF NOT EXISTS deadline_extension_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deadline_extension_threshold_percent int NOT NULL DEFAULT 33
    CHECK (deadline_extension_threshold_percent BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS deadline_extension_duration_minutes int NOT NULL DEFAULT 1440
    CHECK (deadline_extension_duration_minutes BETWEEN 1 AND 10080),
  ADD COLUMN IF NOT EXISTS deadline_extension_max_per_phase int DEFAULT NULL
    CHECK (deadline_extension_max_per_phase IS NULL OR deadline_extension_max_per_phase >= 0);

ALTER TABLE public.deadline_extension_log
  ADD COLUMN IF NOT EXISTS extension_minutes int,
  ADD COLUMN IF NOT EXISTS triggered_by text NOT NULL DEFAULT 'vote_threshold'
    CHECK (triggered_by IN ('vote_threshold', 'commissioner')),
  ADD COLUMN IF NOT EXISTS triggered_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_count int,
  ADD COLUMN IF NOT EXISTS threshold_count int,
  ADD COLUMN IF NOT EXISTS capped_by_round_id uuid REFERENCES public.rounds(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reason text;

UPDATE public.deadline_extension_log
   SET extension_minutes = COALESCE(extension_minutes, extension_hours * 60)
 WHERE extension_minutes IS NULL;

ALTER TABLE public.deadline_extension_log
  ALTER COLUMN extension_minutes SET DEFAULT 1440,
  ALTER COLUMN extension_minutes SET NOT NULL;

-- Replace the initial broad policies with league-scoped policies.
DROP POLICY IF EXISTS "ext_requests_select" ON public.deadline_extension_requests;
DROP POLICY IF EXISTS "ext_requests_insert" ON public.deadline_extension_requests;
DROP POLICY IF EXISTS "ext_requests_delete" ON public.deadline_extension_requests;
DROP POLICY IF EXISTS "ext_log_select" ON public.deadline_extension_log;

CREATE POLICY "League members can view extension requests"
  ON public.deadline_extension_requests FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.rounds r
        JOIN public.seasons s ON s.id = r.season_id
        JOIN public.league_members lm ON lm.league_id = s.league_id
       WHERE r.id = deadline_extension_requests.round_id
         AND lm.user_id = auth.uid()
    )
  );

-- No INSERT/DELETE policies on request rows: mutations must go through the
-- RPCs below so threshold checks and deadline updates stay atomic.

CREATE POLICY "League members can view extension log"
  ON public.deadline_extension_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.rounds r
        JOIN public.seasons s ON s.id = r.season_id
        JOIN public.league_members lm ON lm.league_id = s.league_id
       WHERE r.id = deadline_extension_log.round_id
         AND lm.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public._apply_deadline_extension(
  p_round_id uuid,
  p_deadline_type text,
  p_triggered_by text,
  p_triggered_by_user_id uuid,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round_id uuid;
  v_season_id uuid;
  v_round_number int;
  v_submission_deadline timestamptz;
  v_voting_deadline timestamptz;
  v_league_id uuid;
  v_admin_user_id uuid;
  v_enabled boolean;
  v_threshold_percent int;
  v_duration_minutes int;
  v_max_per_phase int;
  v_eligible_count int;
  v_requested_count int;
  v_threshold_count int;
  v_existing_extensions int;
  v_previous_deadline timestamptz;
  v_uncapped_deadline timestamptz;
  v_new_deadline timestamptz;
  v_cap_deadline timestamptz;
  v_cap_round_id uuid;
  v_log_outcome text;
  v_reason text;
  v_min_extension interval := interval '30 minutes';
BEGIN
  IF p_deadline_type NOT IN ('submission', 'voting') THEN
    RAISE EXCEPTION 'Unsupported deadline type: %', p_deadline_type;
  END IF;

  IF p_triggered_by NOT IN ('vote_threshold', 'commissioner') THEN
    RAISE EXCEPTION 'Unsupported extension trigger: %', p_triggered_by;
  END IF;

  SELECT r.id,
         r.season_id,
         r.round_number,
         r.submission_deadline_at,
         r.voting_deadline_at,
         s.league_id,
         l.admin_user_id,
         s.deadline_extension_enabled,
         s.deadline_extension_threshold_percent,
         s.deadline_extension_duration_minutes,
         s.deadline_extension_max_per_phase
    INTO v_round_id,
         v_season_id,
         v_round_number,
         v_submission_deadline,
         v_voting_deadline,
         v_league_id,
         v_admin_user_id,
         v_enabled,
         v_threshold_percent,
         v_duration_minutes,
         v_max_per_phase
    FROM public.rounds r
    JOIN public.seasons s ON s.id = r.season_id
    JOIN public.leagues l ON l.id = s.league_id
   WHERE r.id = p_round_id
   FOR UPDATE OF r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found';
  END IF;

  IF NOT v_enabled THEN
    RAISE EXCEPTION 'Deadline extensions are disabled for this season';
  END IF;

  SELECT COUNT(*) INTO v_eligible_count
    FROM public.league_members
   WHERE league_id = v_league_id
     AND role = 'participant';

  IF v_eligible_count <= 0 THEN
    RAISE EXCEPTION 'No eligible participants for this round';
  END IF;

  v_threshold_count := GREATEST(1, CEIL(v_eligible_count * v_threshold_percent / 100.0)::int);

  SELECT COUNT(*) INTO v_requested_count
    FROM public.deadline_extension_requests
   WHERE round_id = p_round_id
     AND deadline_type = p_deadline_type;

  IF p_deadline_type = 'submission' THEN
    IF now() >= v_submission_deadline THEN
      RAISE EXCEPTION 'Submission extension requests are closed for this round';
    END IF;

    IF v_round_number > 1 AND EXISTS (
      SELECT 1
        FROM public.rounds prev
       WHERE prev.season_id = v_season_id
         AND prev.round_number = v_round_number - 1
         AND prev.voting_deadline_at > now()
    ) THEN
      RAISE EXCEPTION 'This round is not open for submissions yet';
    END IF;

    v_previous_deadline := v_submission_deadline;
    v_cap_deadline := v_voting_deadline;
    v_cap_round_id := p_round_id;
  ELSE
    IF now() < v_submission_deadline THEN
      RAISE EXCEPTION 'Voting has not opened for this round';
    END IF;

    IF now() >= v_voting_deadline THEN
      RAISE EXCEPTION 'Voting extension requests are closed for this round';
    END IF;

    v_previous_deadline := v_voting_deadline;

    SELECT next.id, next.submission_deadline_at
      INTO v_cap_round_id, v_cap_deadline
      FROM public.rounds next
     WHERE next.season_id = v_season_id
       AND next.round_number = v_round_number + 1
     LIMIT 1;
  END IF;

  IF NOT p_force AND v_requested_count < v_threshold_count THEN
    RETURN jsonb_build_object(
      'outcome', 'pending',
      'requested_count', v_requested_count,
      'threshold_count', v_threshold_count
    );
  END IF;

  SELECT COUNT(*) INTO v_existing_extensions
    FROM public.deadline_extension_log
   WHERE round_id = p_round_id
     AND deadline_type = p_deadline_type
     AND outcome = 'extended';

  IF v_max_per_phase IS NOT NULL AND v_existing_extensions >= v_max_per_phase THEN
    v_log_outcome := 'blocked';
    v_reason := 'max_extensions_reached';
  END IF;

  v_uncapped_deadline := v_previous_deadline + make_interval(mins => v_duration_minutes);
  v_new_deadline := CASE
    WHEN v_cap_deadline IS NULL THEN v_uncapped_deadline
    ELSE LEAST(v_uncapped_deadline, v_cap_deadline)
  END;

  IF v_log_outcome IS NULL
     AND v_cap_deadline IS NOT NULL
     AND v_uncapped_deadline > v_cap_deadline
  THEN
    v_log_outcome := 'blocked';
    v_reason := 'deadline_boundary_reached';
  END IF;

  IF v_log_outcome IS NULL AND v_new_deadline <= v_previous_deadline + v_min_extension THEN
    v_log_outcome := 'blocked';
    v_reason := 'deadline_boundary_reached';
  END IF;

  IF v_log_outcome = 'blocked' THEN
    INSERT INTO public.deadline_extension_log (
      round_id,
      deadline_type,
      outcome,
      previous_deadline,
      new_deadline,
      extension_hours,
      extension_minutes,
      triggered_by,
      triggered_by_user_id,
      requested_count,
      threshold_count,
      capped_by_round_id,
      reason
    ) VALUES (
      p_round_id,
      p_deadline_type,
      'blocked',
      v_previous_deadline,
      NULL,
      CEIL(v_duration_minutes / 60.0)::int,
      v_duration_minutes,
      p_triggered_by,
      p_triggered_by_user_id,
      v_requested_count,
      v_threshold_count,
      v_cap_round_id,
      v_reason
    );

    DELETE FROM public.deadline_extension_requests
     WHERE round_id = p_round_id
       AND deadline_type = p_deadline_type;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_admin_user_id,
      'deadline_extension_blocked',
      'Extension blocked',
      'An extension request hit a season timeline limit.',
      jsonb_build_object(
        'round_id', p_round_id,
        'season_id', v_season_id,
        'league_id', v_league_id,
        'deadline_type', p_deadline_type,
        'reason', v_reason
      )
    );

    RETURN jsonb_build_object(
      'outcome', 'blocked',
      'reason', v_reason,
      'requested_count', v_requested_count,
      'threshold_count', v_threshold_count
    );
  END IF;

  IF p_deadline_type = 'submission' THEN
    UPDATE public.rounds
       SET submission_deadline_at = v_new_deadline
     WHERE id = p_round_id;
  ELSE
    UPDATE public.rounds
       SET voting_deadline_at = v_new_deadline
     WHERE id = p_round_id;
  END IF;

  INSERT INTO public.deadline_extension_log (
    round_id,
    deadline_type,
    outcome,
    previous_deadline,
    new_deadline,
    extension_hours,
    extension_minutes,
    triggered_by,
    triggered_by_user_id,
    requested_count,
    threshold_count,
    capped_by_round_id,
    reason
  ) VALUES (
    p_round_id,
    p_deadline_type,
    'extended',
    v_previous_deadline,
    v_new_deadline,
    CEIL(v_duration_minutes / 60.0)::int,
    v_duration_minutes,
    p_triggered_by,
    p_triggered_by_user_id,
    v_requested_count,
    v_threshold_count,
    NULL,
    v_reason
  );

  DELETE FROM public.deadline_extension_requests
   WHERE round_id = p_round_id
     AND deadline_type = p_deadline_type;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT lm.user_id,
         CASE WHEN p_deadline_type = 'submission' THEN 'subs_extended' ELSE 'voting_extended' END,
         'Deadline extended',
         CASE
           WHEN p_deadline_type = 'submission' THEN 'The submission deadline was extended.'
           ELSE 'The voting deadline was extended.'
         END,
         jsonb_build_object(
           'round_id', p_round_id,
           'season_id', v_season_id,
           'league_id', v_league_id,
           'deadline_type', p_deadline_type,
           'previous_deadline', v_previous_deadline,
           'new_deadline', v_new_deadline,
           'capped', false
         )
    FROM public.league_members lm
   WHERE lm.league_id = v_league_id;

  RETURN jsonb_build_object(
    'outcome', 'extended',
    'previous_deadline', v_previous_deadline,
    'new_deadline', v_new_deadline,
    'requested_count', v_requested_count,
    'threshold_count', v_threshold_count,
    'capped', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.request_deadline_extension(
  p_round_id uuid,
  p_deadline_type text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league_id uuid;
  v_admin_user_id uuid;
  v_inserted boolean := false;
  v_result jsonb;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Cannot request an extension for another user';
  END IF;

  SELECT s.league_id, l.admin_user_id
    INTO v_league_id, v_admin_user_id
    FROM public.rounds r
    JOIN public.seasons s ON s.id = r.season_id
    JOIN public.leagues l ON l.id = s.league_id
   WHERE r.id = p_round_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.league_members lm
     WHERE lm.league_id = v_league_id
       AND lm.user_id = p_user_id
       AND lm.role = 'participant'
  ) THEN
    RAISE EXCEPTION 'Only participants can request deadline extensions';
  END IF;

  INSERT INTO public.deadline_extension_requests (round_id, deadline_type, user_id)
  VALUES (p_round_id, p_deadline_type, p_user_id)
  ON CONFLICT (round_id, deadline_type, user_id) DO NOTHING
  RETURNING true INTO v_inserted;

  IF COALESCE(v_inserted, false) THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_admin_user_id,
      'deadline_extension_requested',
      'Extension requested',
      'A player requested a deadline extension.',
      jsonb_build_object(
        'round_id', p_round_id,
        'league_id', v_league_id,
        'deadline_type', p_deadline_type,
        'requester_user_id', p_user_id
      )
    );
  END IF;

  v_result := public._apply_deadline_extension(
    p_round_id,
    p_deadline_type,
    'vote_threshold',
    p_user_id,
    false
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_deadline_extension_request(
  p_round_id uuid,
  p_deadline_type text,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league_id uuid;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Cannot cancel an extension request for another user';
  END IF;

  SELECT s.league_id
    INTO v_league_id
    FROM public.rounds r
    JOIN public.seasons s ON s.id = r.season_id
   WHERE r.id = p_round_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.league_members lm
     WHERE lm.league_id = v_league_id
       AND lm.user_id = p_user_id
       AND lm.role = 'participant'
  ) THEN
    RAISE EXCEPTION 'Only participants can cancel deadline extension requests';
  END IF;

  DELETE FROM public.deadline_extension_requests
   WHERE round_id = p_round_id
     AND deadline_type = p_deadline_type
     AND user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.commissioner_extend_deadline(
  p_round_id uuid,
  p_deadline_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_user_id uuid;
BEGIN
  SELECT l.admin_user_id
    INTO v_admin_user_id
    FROM public.rounds r
    JOIN public.seasons s ON s.id = r.season_id
    JOIN public.leagues l ON l.id = s.league_id
   WHERE r.id = p_round_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found';
  END IF;

  IF v_admin_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the commissioner can force a deadline extension';
  END IF;

  RETURN public._apply_deadline_extension(
    p_round_id,
    p_deadline_type,
    'commissioner',
    auth.uid(),
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_deadline_extension(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_deadline_extension_request(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commissioner_extend_deadline(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._apply_deadline_extension(uuid, text, text, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._apply_deadline_extension(uuid, text, text, uuid, boolean) FROM authenticated;
REVOKE ALL ON FUNCTION public._apply_deadline_extension(uuid, text, text, uuid, boolean) FROM anon;

GRANT EXECUTE ON FUNCTION public.request_deadline_extension(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_deadline_extension_request(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commissioner_extend_deadline(uuid, text) TO authenticated;
