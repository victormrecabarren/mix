-- mix: Schema v2.2
-- Adds track metadata fields to submissions for analytics, superlatives, and taste profiling.
-- All columns nullable — populated for Spotify tracks, null for SoundCloud/YouTube.
-- All four fields sourced from Spotify /tracks/<id> at submission time, no extra API call needed.

alter table public.submissions
  add column track_genre        text,
  add column track_release_year int,
  add column track_duration_ms  int,
  add column track_popularity   int;
