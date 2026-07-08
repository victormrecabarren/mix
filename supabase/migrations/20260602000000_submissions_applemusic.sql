-- Add Apple Music support to submissions.
-- apple_music_id stores the catalog track ID from the Apple Music API (e.g. "1440857797").
-- track_source is extended to include 'applemusic'.
-- ISRCs from Apple Music are stored in track_isrc (same as Spotify), enabling cross-platform matching.

alter table public.submissions
  add column apple_music_id text;

-- Extend track_source to include 'applemusic'
alter table public.submissions
  drop constraint submissions_track_source_check;

alter table public.submissions
  add constraint submissions_track_source_check
    check (track_source in ('spotify', 'soundcloud', 'applemusic'));

-- Extend source/ID consistency to cover Apple Music rows.
-- Each source must carry exactly its own identifier and null for the others.
alter table public.submissions
  drop constraint submissions_source_id_consistency_check;

alter table public.submissions
  add constraint submissions_source_id_consistency_check
    check (
      (track_source = 'spotify'    and spotify_track_id    is not null and soundcloud_track_url is null and apple_music_id is null)
      or
      (track_source = 'soundcloud' and soundcloud_track_url is not null and spotify_track_id    is null and apple_music_id is null)
      or
      (track_source = 'applemusic' and apple_music_id       is not null and spotify_track_id    is null and soundcloud_track_url is null)
    );

-- Same Apple Music catalog ID twice in a round is a duplicate.
create unique index submissions_unique_applemusic_id_per_round
  on public.submissions (round_id, apple_music_id)
  where track_source = 'applemusic';
