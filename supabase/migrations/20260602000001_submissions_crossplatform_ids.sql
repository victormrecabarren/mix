-- Cross-platform track IDs on submissions.
--
-- Builds on 20260602000000 (which added apple_music_id + the 'applemusic'
-- source). That migration enforced a STRICT single-ID rule: exactly one of
-- spotify_track_id / soundcloud_track_url / apple_music_id per row.
--
-- We now guarantee every music submission exists on BOTH Spotify and Apple
-- Music (matched by ISRC) and store BOTH catalog IDs on the row, so playback
-- can pick whichever matches the listener's service with no runtime lookup.
-- `track_source` stays as attribution (where the submitter found it).
--
-- This relaxes the consistency check so a music row may carry both music IDs,
-- and replaces the per-source ISRC/apple-id dedup indexes with a single
-- cross-source ISRC index (the same recording submitted via either service —
-- or both — collides in a round).

-- ── Relax the source/ID consistency check ───────────────────────────────────
-- Music rows: the row's own source ID must be present and no SoundCloud URL.
-- The *other* music ID is unconstrained (present after cross-resolution, null
-- for legacy rows that predate this feature). SoundCloud rows: URL only.
alter table public.submissions
  drop constraint submissions_source_id_consistency_check;

alter table public.submissions
  add constraint submissions_source_id_consistency_check
    check (
      (track_source = 'spotify'    and spotify_track_id     is not null and soundcloud_track_url is null)
      or
      (track_source = 'applemusic' and apple_music_id        is not null and soundcloud_track_url is null)
      or
      (track_source = 'soundcloud' and soundcloud_track_url is not null and spotify_track_id is null and apple_music_id is null)
    );

-- ── Replace per-source dedup with one cross-source ISRC index ────────────────
-- Old indexes only deduped within a single source, so the same recording
-- submitted by a Spotify user and an Apple user (different track_source) could
-- both land in a round. ISRC is the shared key — dedup on it across both music
-- sources. Empty ISRC is exempt (can't dedup what we don't have).
drop index if exists submissions_unique_spotify_isrc_per_round;
drop index if exists submissions_unique_applemusic_id_per_round;

create unique index if not exists submissions_unique_music_isrc_per_round
  on public.submissions (round_id, track_isrc)
  where track_source in ('spotify', 'applemusic') and track_isrc <> '';
