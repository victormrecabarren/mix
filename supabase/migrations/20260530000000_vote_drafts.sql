-- ─── vote_drafts ──────────────────────────────────────────────────────────────
-- Per (round, user) in-progress ballot, autosaved from the client so that
-- voting + commenting progress survives an app kill *before* the user submits.
-- One row per voter per round; the whole draft is stored as two JSONB maps so
-- the client can upsert it in a single debounced write:
--   allocation: { "<submission_id>": <points> }
--   comments:   { "<submission_id>": "<body>" }
-- The draft is private to its owner and is cleared once the user submits their
-- real votes via submit_votes (the client deletes it; a stray row is harmless
-- because the app ignores the draft once the user has voted).

create table public.vote_drafts (
  round_id   uuid not null references public.rounds(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  allocation jsonb not null default '{}'::jsonb,
  comments   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (round_id, user_id)
);

alter table public.vote_drafts enable row level security;

-- Drafts are strictly private: a user can only ever see / write / delete their
-- own. No league-member read policy (unlike votes/comments) — an unsubmitted
-- ballot is nobody else's business.
create policy "Users can view own vote draft"
  on public.vote_drafts for select
  using (auth.uid() = user_id);

create policy "Users can insert own vote draft"
  on public.vote_drafts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own vote draft"
  on public.vote_drafts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own vote draft"
  on public.vote_drafts for delete
  using (auth.uid() = user_id);
