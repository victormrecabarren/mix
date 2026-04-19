import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type League = {
  id: string;
  name: string;
  admin_user_id: string;
};

export type Member = {
  user_id: string;
  role: string;
  display_name: string;
};

export const leagueKeys = {
  byId: (id: string) => ["league", id] as const,
  members: (id: string) => ["league", id, "members"] as const,
};

async function fetchLeague(leagueId: string): Promise<League | null> {
  const { data } = await supabase
    .from("leagues")
    .select("id, name, admin_user_id")
    .eq("id", leagueId)
    .single();
  return data ?? null;
}

async function fetchMembers(leagueId: string): Promise<Member[]> {
  const { data } = await supabase
    .from("league_members")
    .select("user_id, role, users(display_name)")
    .eq("league_id", leagueId)
    .order("joined_at", { ascending: true });

  return (data ?? []).map((m) => ({
    user_id: m.user_id,
    role: m.role,
    display_name:
      (Array.isArray(m.users)
        ? m.users[0]?.display_name
        : (m.users as { display_name: string } | null)?.display_name) ?? "Unknown",
  }));
}

export function useLeague(leagueId: string | null | undefined) {
  return useQuery({
    queryKey: leagueId ? leagueKeys.byId(leagueId) : ["league", "disabled"],
    queryFn: () => (leagueId ? fetchLeague(leagueId) : null),
    enabled: !!leagueId,
  });
}

export function useLeagueMembers(leagueId: string | null | undefined) {
  return useQuery({
    queryKey: leagueId ? leagueKeys.members(leagueId) : ["league", "disabled", "members"],
    queryFn: () => (leagueId ? fetchMembers(leagueId) : []),
    enabled: !!leagueId,
  });
}
