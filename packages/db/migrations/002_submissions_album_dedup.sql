-- mix: Schema v2.1
-- Adds album name to submissions for same-album warnings during track selection.
-- Adds unique constraint to hard-enforce no duplicate tracks within a round.

alter table public.submissions
  add column track_album_name text;

alter table public.submissions
  add constraint unique_track_per_round unique (round_id, track_isrc);
