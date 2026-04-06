-- mix: Initial Schema
-- Run via: supabase db push

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- USERS (extends Supabase auth.users)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  spotify_id text unique,
  apple_music_id text unique,
  created_at timestamptz not null default now()
);
alter table public.users enable row level security;
create policy "Users can view all profiles" on public.users for select using (true);
create policy "Users can update own profile" on public.users for update using (auth.uid() = id);

-- LEAGUES
create table public.leagues (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  admin_user_id uuid not null references public.users(id),
  master_playlist_mode text not null check (master_playlist_mode in ('fresh', 'cloned', 'linked')) default 'fresh',
  master_playlist_ref text, -- platform-specific playlist ID
  created_at timestamptz not null default now()
);
alter table public.leagues enable row level security;
create policy "League members can view leagues" on public.leagues for select
  using (exists (select 1 from public.league_members where league_id = id and user_id = auth.uid()));
create policy "Admin can update league" on public.leagues for update using (admin_user_id = auth.uid());
create policy "Authenticated users can create leagues" on public.leagues for insert with check (auth.uid() = admin_user_id);

-- LEAGUE MEMBERS
create table public.league_members (
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
alter table public.league_members enable row level security;
create policy "Members can view league membership" on public.league_members for select
  using (exists (select 1 from public.league_members lm where lm.league_id = league_id and lm.user_id = auth.uid()));
create policy "Users can join leagues" on public.league_members for insert with check (auth.uid() = user_id);

-- SEASONS
create table public.seasons (
  id uuid primary key default uuid_generate_v4(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  name text not null,
  season_number int not null,
  status text not null check (status in ('active', 'completed')) default 'active',
  season_playlist_ref text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (league_id, season_number)
);
alter table public.seasons enable row level security;
create policy "League members can view seasons" on public.seasons for select
  using (exists (select 1 from public.league_members where league_id = seasons.league_id and user_id = auth.uid()));
create policy "League admin can manage seasons" on public.seasons for all
  using (exists (select 1 from public.leagues where id = seasons.league_id and admin_user_id = auth.uid()));

-- ROUNDS
create table public.rounds (
  id uuid primary key default uuid_generate_v4(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  round_number int not null,
  prompt text not null,
  status text not null check (status in ('open_submissions', 'voting', 'completed')) default 'open_submissions',
  submission_deadline_at timestamptz not null,
  voting_deadline_at timestamptz not null,
  round_playlist_ref text,
  created_at timestamptz not null default now(),
  unique (season_id, round_number)
);
alter table public.rounds enable row level security;
create policy "Season members can view rounds" on public.rounds for select
  using (exists (
    select 1 from public.seasons s
    join public.league_members lm on lm.league_id = s.league_id
    where s.id = rounds.season_id and lm.user_id = auth.uid()
  ));
create policy "League admin can manage rounds" on public.rounds for all
  using (exists (
    select 1 from public.seasons s
    join public.leagues l on l.id = s.league_id
    where s.id = rounds.season_id and l.admin_user_id = auth.uid()
  ));

-- SUBMISSIONS
create table public.submissions (
  id uuid primary key default uuid_generate_v4(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  user_id uuid not null references public.users(id),
  track_isrc text not null,
  spotify_track_id text,
  apple_music_track_id text,
  track_title text not null,
  track_artist text not null,
  track_artwork_url text,
  anonymous_position int, -- assigned server-side when submission window closes
  created_at timestamptz not null default now(),
  -- max 2 submissions per user per round enforced via app + trigger
  constraint unique_submission_slot unique (round_id, user_id, anonymous_position)
);
alter table public.submissions enable row level security;
-- During voting/open: hide user_id (anonymity). After completed: reveal.
create policy "Members can view submissions (anonymous during voting)" on public.submissions for select
  using (exists (
    select 1 from public.rounds r
    join public.seasons s on s.id = r.season_id
    join public.league_members lm on lm.league_id = s.league_id
    where r.id = submissions.round_id and lm.user_id = auth.uid()
  ));
create policy "Users can insert own submissions" on public.submissions for insert
  with check (auth.uid() = user_id);

-- VOTES
create table public.votes (
  id uuid primary key default uuid_generate_v4(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  voter_user_id uuid not null references public.users(id),
  points int not null check (points > 0),
  created_at timestamptz not null default now(),
  unique (voter_user_id, submission_id)
);
alter table public.votes enable row level security;
create policy "League members can view votes" on public.votes for select
  using (exists (
    select 1 from public.rounds r
    join public.seasons s on s.id = r.season_id
    join public.league_members lm on lm.league_id = s.league_id
    where r.id = votes.round_id and lm.user_id = auth.uid()
  ));
create policy "Users can insert own votes" on public.votes for insert
  with check (auth.uid() = voter_user_id);

-- COMMENTS
create table public.comments (
  id uuid primary key default uuid_generate_v4(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  author_user_id uuid not null references public.users(id),
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.comments enable row level security;
create policy "League members can view and post comments" on public.comments for select
  using (exists (
    select 1 from public.rounds r
    join public.seasons s on s.id = r.season_id
    join public.league_members lm on lm.league_id = s.league_id
    where r.id = comments.round_id and lm.user_id = auth.uid()
  ));
create policy "Users can insert own comments" on public.comments for insert
  with check (auth.uid() = author_user_id);

-- LEADERBOARD SNAPSHOTS
create table public.leaderboard_snapshots (
  id uuid primary key default uuid_generate_v4(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  season_id uuid references public.seasons(id) on delete cascade, -- null = all-time
  user_id uuid not null references public.users(id),
  total_points int not null default 0,
  updated_at timestamptz not null default now(),
  unique (league_id, season_id, user_id)
);
alter table public.leaderboard_snapshots enable row level security;
create policy "League members can view leaderboard" on public.leaderboard_snapshots for select
  using (exists (select 1 from public.league_members where league_id = leaderboard_snapshots.league_id and user_id = auth.uid()));
