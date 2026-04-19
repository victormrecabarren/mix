import { supabase } from "@/lib/supabase";
import { postgresToMixError } from "./errors";

export type League = {
  id: string;
  name: string;
  admin_user_id: string;
};

export type LeagueMember = {
  user_id: string;
  role: "participant" | "spectator";
  display_name: string;
};

export type LeagueSummary = {
  id: string;
  name: string;
};

export async function getLeague(leagueId: string): Promise<League | null> {
  const { data, error } = await supabase
    .from("leagues")
    .select("id, name, admin_user_id")
    .eq("id", leagueId)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw postgresToMixError(error);
  }
  return data;
}

export async function getLeagueMembers(
  leagueId: string,
): Promise<LeagueMember[]> {
  const { data, error } = await supabase
    .from("league_members")
    .select("user_id, role, users(display_name)")
    .eq("league_id", leagueId)
    .order("joined_at", { ascending: true });
  if (error) throw postgresToMixError(error);
  return (data ?? []).map((row) => {
    const user = Array.isArray(row.users) ? row.users[0] : row.users;
    return {
      user_id: row.user_id,
      role: row.role as LeagueMember["role"],
      display_name: user?.display_name ?? "",
    };
  });
}

// Returns the caller's role in this league, or null if they're not a member.
export async function getMyRole(
  leagueId: string,
  userId: string,
): Promise<LeagueMember["role"] | null> {
  const { data, error } = await supabase
    .from("league_members")
    .select("role")
    .eq("league_id", leagueId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw postgresToMixError(error);
  return (data?.role as LeagueMember["role"] | undefined) ?? null;
}

// The first league the user joined. Used by LeagueContext to pick a default
// active league on login.
export async function getFirstLeagueIdForUser(
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw postgresToMixError(error);
  return data?.league_id ?? null;
}
