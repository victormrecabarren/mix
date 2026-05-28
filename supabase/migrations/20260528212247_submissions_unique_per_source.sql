-- mix: per-source uniqueness within a round.
--
-- The original `unique_track_per_round (round_id, track_isrc)` constraint
-- assumed every submission has an ISRC — true for Spotify, false for
-- SoundCloud (oEmbed doesn't expose one). The submission writer parks
-- track_isrc = '' for SC tracks, so any two SC tracks in the same round
-- collide on (round_id, '') and the second insert fails with
-- unique_track_per_round.
--
-- New scheme: split the dedup rule by source.
--   * Spotify: still dedup by ISRC (catches "same song from a different
--     album" since one song can have multiple Spotify track ids but the
--     ISRC is stable). Skip rows with empty ISRC — we can't dedup what
--     we don't have, and we'd rather allow the submission than reject it.
--   * SoundCloud: dedup by the canonical track URL.
--
-- The old constraint is dropped; everything is rewritten as partial
-- unique indexes. Index names line up with what
-- `postgresToMixError` expects so DuplicateTrackError is still raised.

alter table public.submissions
  drop constraint if exists unique_track_per_round;

-- Spotify rows: same ISRC twice in a round is a duplicate. Empty ISRC
-- rows are exempt (the API didn't give us one — better to accept the
-- submission than to fail it).
create unique index if not exists submissions_unique_spotify_isrc_per_round
  on public.submissions (round_id, track_isrc)
  where track_source = 'spotify' and track_isrc <> '';

-- SoundCloud rows: same canonical URL twice in a round is a duplicate.
create unique index if not exists submissions_unique_soundcloud_url_per_round
  on public.submissions (round_id, soundcloud_track_url)
  where track_source = 'soundcloud';
