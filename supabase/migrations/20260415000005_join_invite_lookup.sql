-- Allow invitees to resolve league + season names before they become members.

create or replace function public.get_join_invite_info(invite_token uuid)
returns table (
  season_id uuid,
  season_name text,
  league_id uuid,
  league_name text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    s.id as season_id,
    s.name as season_name,
    l.id as league_id,
    l.name as league_name
  from public.seasons s
  join public.leagues l on l.id = s.league_id
  where s.invite_token = get_join_invite_info.invite_token;
$$;
