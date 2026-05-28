-- mix: SoundCloud submission support
-- Adds `track_source` discriminator + `soundcloud_track_url` to submissions.
-- A check constraint enforces that exactly one source-ID column is populated
-- and that it matches the discriminator. Existing rows default to 'spotify',
-- which is consistent with the current schema (every existing row has a
-- non-null spotify_track_id).

alter table public.submissions
  add column track_source         text not null default 'spotify',
  add column soundcloud_track_url text;

alter table public.submissions
  add constraint submissions_track_source_check
    check (track_source in ('spotify', 'soundcloud'));

-- Source/ID consistency: the discriminator picks exactly one ID column.
-- Spotify rows must carry spotify_track_id and no SC URL; SoundCloud rows
-- must carry a soundcloud_track_url and no Spotify ID. apple_music_track_id
-- is intentionally untouched — it's currently unused and not part of the
-- source discriminator yet.
alter table public.submissions
  add constraint submissions_source_id_consistency_check
    check (
      (track_source = 'spotify'    and spotify_track_id     is not null and soundcloud_track_url is null)
      or
      (track_source = 'soundcloud' and soundcloud_track_url is not null and spotify_track_id     is null)
    );
