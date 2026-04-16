-- Atomic league creation: inserts league + commissioner membership in one call.
-- Uses auth.uid() server-side so no user ID needs to be passed from the client,
-- and the RLS check is always satisfied.

create or replace function public.create_league(league_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.leagues (name, admin_user_id)
  values (league_name, auth.uid())
  returning id into new_id;

  insert into public.league_members (league_id, user_id, role)
  values (new_id, auth.uid(), 'participant');

  return new_id;
end;
$$;
