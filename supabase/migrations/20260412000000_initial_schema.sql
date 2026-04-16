-- mix: Schema v2
-- Key design decisions:
-- - Round status derived from timestamps (no status column on rounds)
-- - Anonymity enforced via submissions_public view
-- - playlist_position assigned by pg_cron after submission_deadline_at passes
-- - Votes stored in full even when void (is_void=true) for ghost points superlative
-- - invite_token on seasons drives the join deep link (mix://join?token=<uuid>)

create extension if not exists "uuid-ossp";
create extension if not exists "pg_cron";

-- ============================================================
-- TABLES
-- ============================================================
-- All tables created first so cross-referencing RLS policies work.

create table public.users (
  id             uuid primary key references auth.users(id) on delete cascade,
  display_name   text not null default 'DJ Anon',
  avatar_url     text,
  spotify_id     text unique,
  apple_music_id text unique,
  created_at     timestamptz not null default now()
);

create table public.leagues (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  admin_user_id        uuid not null references public.users(id),
  master_playlist_mode text not null default 'fresh'
    check (master_playlist_mode in ('fresh', 'cloned', 'linked')),
  master_playlist_ref  text,
  created_at           timestamptz not null default now()
);

create table public.league_members (
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id   uuid not null references public.users(id) on delete cascade,
  role      text not null default 'participant'
    check (role in ('participant', 'spectator')),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create table public.seasons (
  id                           uuid primary key default gen_random_uuid(),
  league_id                    uuid not null references public.leagues(id) on delete cascade,
  name                         text not null,
  season_number                int not null,
  status                       text not null default 'active'
    check (status in ('active', 'completed')),
  invite_token                 uuid not null default gen_random_uuid() unique,
  participant_cap              int,
  default_points_per_round     int not null default 10,
  default_max_points_per_track int not null default 5,
  season_playlist_ref          text,
  created_at                   timestamptz not null default now(),
  completed_at                 timestamptz,
  unique (league_id, season_number)
);

create table public.rounds (
  id                     uuid primary key default gen_random_uuid(),
  season_id              uuid not null references public.seasons(id) on delete cascade,
  round_number           int not null,
  prompt                 text not null,
  submission_deadline_at timestamptz not null,
  voting_deadline_at     timestamptz not null,
  points_per_round       int,
  max_points_per_track   int,
  round_playlist_ref     text,
  created_at             timestamptz not null default now(),
  unique (season_id, round_number)
);

create table public.round_participants (
  round_id uuid not null references public.rounds(id) on delete cascade,
  user_id  uuid not null references public.users(id) on delete cascade,
  voted_at timestamptz,
  is_void  boolean not null default false,
  primary key (round_id, user_id)
);

create table public.submissions (
  id                   uuid primary key default gen_random_uuid(),
  round_id             uuid not null references public.rounds(id) on delete cascade,
  user_id              uuid not null references public.users(id),
  track_isrc           text not null,
  spotify_track_id     text,
  apple_music_track_id text,
  track_title          text not null,
  track_artist         text not null,
  track_artwork_url    text,
  playlist_position    int,
  created_at           timestamptz not null default now(),
  unique (round_id, playlist_position)
);

create table public.votes (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  round_id      uuid not null references public.rounds(id) on delete cascade,
  voter_user_id uuid not null references public.users(id),
  points        int not null check (points > 0),
  is_void       boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (voter_user_id, submission_id)
);

create table public.comments (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references public.submissions(id) on delete cascade,
  round_id       uuid not null references public.rounds(id) on delete cascade,
  author_user_id uuid not null references public.users(id),
  body           text not null,
  created_at     timestamptz not null default now()
);

create table public.leaderboard_snapshots (
  id           uuid primary key default gen_random_uuid(),
  league_id    uuid not null references public.leagues(id) on delete cascade,
  season_id    uuid references public.seasons(id) on delete cascade,
  user_id      uuid not null references public.users(id),
  total_points int not null default 0,
  updated_at   timestamptz not null default now(),
  unique (league_id, season_id, user_id)
);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.users enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.seasons enable row level security;
alter table public.rounds enable row level security;
alter table public.round_participants enable row level security;
alter table public.submissions enable row level security;
alter table public.votes enable row level security;
alter table public.comments enable row level security;
alter table public.leaderboard_snapshots enable row level security;


-- ============================================================
-- POLICIES
-- ============================================================

-- users
create policy "Users can view all profiles"
  on public.users for select using (true);
create policy "Users can update own profile"
  on public.users for update using (auth.uid() = id);

-- leagues
create policy "League members can view leagues"
  on public.leagues for select
  using (exists (
    select 1 from public.league_members
    where league_id = id and user_id = auth.uid()
  ));
create policy "Authenticated users can create leagues"
  on public.leagues for insert
  with check (auth.uid() = admin_user_id);
create policy "Admin can update league"
  on public.leagues for update using (admin_user_id = auth.uid());

-- league_members
create policy "Members can view league membership"
  on public.league_members for select
  using (exists (
    select 1 from public.league_members lm
    where lm.league_id = league_members.league_id and lm.user_id = auth.uid()
  ));
create policy "Users can join leagues"
  on public.league_members for insert
  with check (auth.uid() = user_id);
create policy "Users can update own membership role"
  on public.league_members for update
  using (auth.uid() = user_id);

-- seasons
create policy "League members can view seasons"
  on public.seasons for select
  using (exists (
    select 1 from public.league_members
    where league_id = seasons.league_id and user_id = auth.uid()
  ));
create policy "Anyone can look up season by invite token"
  on public.seasons for select using (true);
create policy "League admin can manage seasons"
  on public.seasons for all
  using (exists (
    select 1 from public.leagues
    where id = seasons.league_id and admin_user_id = auth.uid()
  ));

-- rounds
create policy "Season members can view rounds"
  on public.rounds for select
  using (exists (
    select 1 from public.seasons s
    join public.league_members lm on lm.league_id = s.league_id
    where s.id = rounds.season_id and lm.user_id = auth.uid()
  ));
create policy "League admin can manage rounds"
  on public.rounds for all
  using (exists (
    select 1 from public.seasons s
    join public.leagues l on l.id = s.league_id
    where s.id = rounds.season_id and l.admin_user_id = auth.uid()
  ));

-- round_participants
create policy "League members can view round participants"
  on public.round_participants for select
  using (exists (
    select 1 from public.rounds r
    join public.seasons s on s.id = r.season_id
    join public.league_members lm on lm.league_id = s.league_id
    where r.id = round_participants.round_id and lm.user_id = auth.uid()
  ));
create policy "Users can manage own participation"
  on public.round_participants for all
  using (auth.uid() = user_id);

-- submissions
create policy "League members can view submissions"
  on public.submissions for select
  using (exists (
    select 1 from public.rounds r
    join public.seasons s on s.id = r.season_id
    join public.league_members lm on lm.league_id = s.league_id
    where r.id = submissions.round_id and lm.user_id = auth.uid()
  ));
create policy "Participants can insert own submissions"
  on public.submissions for insert
  with check (
    auth.uid() = user_id and
    exists (
      select 1 from public.rounds r
      join public.seasons s on s.id = r.season_id
      join public.league_members lm on lm.league_id = s.league_id
      where r.id = submissions.round_id
        and lm.user_id = auth.uid()
        and lm.role = 'participant'
    )
  );

-- votes
create policy "League members can view votes"
  on public.votes for select
  using (exists (
    select 1 from public.rounds r
    join public.seasons s on s.id = r.season_id
    join public.league_members lm on lm.league_id = s.league_id
    where r.id = votes.round_id and lm.user_id = auth.uid()
  ));
create policy "Participants can insert own votes"
  on public.votes for insert
  with check (
    auth.uid() = voter_user_id and
    exists (
      select 1 from public.rounds r
      join public.seasons s on s.id = r.season_id
      join public.league_members lm on lm.league_id = s.league_id
      where r.id = votes.round_id
        and lm.user_id = auth.uid()
        and lm.role = 'participant'
    )
  );

-- comments
create policy "League members can view comments"
  on public.comments for select
  using (exists (
    select 1 from public.rounds r
    join public.seasons s on s.id = r.season_id
    join public.league_members lm on lm.league_id = s.league_id
    where r.id = comments.round_id and lm.user_id = auth.uid()
  ));
create policy "Participants can post comments"
  on public.comments for insert
  with check (
    auth.uid() = author_user_id and
    exists (
      select 1 from public.rounds r
      join public.seasons s on s.id = r.season_id
      join public.league_members lm on lm.league_id = s.league_id
      where r.id = comments.round_id
        and lm.user_id = auth.uid()
        and lm.role = 'participant'
    )
  );

-- leaderboard_snapshots
create policy "League members can view leaderboard"
  on public.leaderboard_snapshots for select
  using (exists (
    select 1 from public.league_members
    where league_id = leaderboard_snapshots.league_id
      and user_id = auth.uid()
  ));


-- ============================================================
-- VIEWS
-- ============================================================

-- Masks submissions.user_id during voting phase.
-- App queries this view instead of the raw submissions table.
create or replace view public.submissions_public as
  select
    s.id,
    s.round_id,
    case
      when now() >= r.voting_deadline_at then s.user_id
      else null
    end as user_id,
    s.track_isrc,
    s.spotify_track_id,
    s.apple_music_track_id,
    s.track_title,
    s.track_artist,
    s.track_artwork_url,
    s.playlist_position,
    s.created_at
  from public.submissions s
  join public.rounds r on r.id = s.round_id;


-- ============================================================
-- PG_CRON JOBS
-- ============================================================
-- References stored procedures to be created separately.

-- Assign playlist_position after submission deadline passes.
select cron.schedule(
  'assign-playlist-positions',
  '* * * * *',
  $$ select assign_playlist_positions(); $$
);

-- Mark non-voters void + update leaderboard snapshots after voting deadline.
select cron.schedule(
  'close-voting-rounds',
  '* * * * *',
  $$ select close_voting_rounds(); $$
);
