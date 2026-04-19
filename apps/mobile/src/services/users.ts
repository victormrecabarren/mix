import { supabase } from "@/lib/supabase";
import { postgresToMixError } from "./errors";

export type UserLeagueSummary = {
  id: string;
  name: string;
};

export async function getUserDisplayName(
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw postgresToMixError(error);
  return data?.display_name ?? null;
}

export async function getMyLeagues(
  userId: string,
): Promise<UserLeagueSummary[]> {
  // Must filter by user_id — league_members RLS lets a caller read every
  // member of every league they belong to, so an unfiltered query returns
  // duplicate league rows (one per co-member).
  const { data, error } = await supabase
    .from("league_members")
    .select("league:leagues(id, name)")
    .eq("user_id", userId);
  if (error) throw postgresToMixError(error);
  return (data ?? [])
    .map((r) => r.league as UserLeagueSummary | null)
    .filter((l): l is UserLeagueSummary => l !== null);
}

export async function updateProfile(
  userId: string,
  patch: { displayName?: string },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.displayName !== undefined) row.display_name = patch.displayName;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase
    .from("users")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(row as any)
    .eq("id", userId);
  if (error) throw postgresToMixError(error);
}
