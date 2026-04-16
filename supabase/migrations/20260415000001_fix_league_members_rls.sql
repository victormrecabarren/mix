-- Fix infinite recursion in league_members RLS policy.
--
-- The original policy checked league_members to decide if you could read
-- league_members — circular. The fix: a security definer function that
-- fetches the caller's league IDs while bypassing RLS, then use that
-- in the policy instead of a direct self-referencing subquery.

create or replace function public.my_league_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select league_id from public.league_members where user_id = auth.uid();
$$;

drop policy if exists "Members can view league membership" on public.league_members;

create policy "Members can view league membership"
  on public.league_members for select
  using (league_id in (select public.my_league_ids()));
