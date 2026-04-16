-- Add richer round copy and editable submission notes.

ALTER TABLE public.rounds
  ADD COLUMN description text NOT NULL DEFAULT '';

ALTER TABLE public.submissions
  ADD COLUMN comment text;

-- Allow participants to edit their own submissions while the submission window is open.
CREATE POLICY "Participants can update own submissions while open"
  ON public.submissions
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.rounds r
      JOIN public.seasons s ON s.id = r.season_id
      JOIN public.league_members lm ON lm.league_id = s.league_id
      WHERE r.id = submissions.round_id
        AND lm.user_id = auth.uid()
        AND lm.role = 'participant'
        AND now() < r.submission_deadline_at
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.rounds r
      JOIN public.seasons s ON s.id = r.season_id
      JOIN public.league_members lm ON lm.league_id = s.league_id
      WHERE r.id = submissions.round_id
        AND lm.user_id = auth.uid()
        AND lm.role = 'participant'
        AND now() < r.submission_deadline_at
    )
  );
