import { supabase } from "@/lib/supabase";
import { postgresToMixError } from "./errors";

export type SeasonStatus = "draft" | "active" | "completed";

export type Season = {
  id: string;
  name: string;
  season_number: number;
  status: string;
  league_id: string;
  submissions_per_user: number;
  default_points_per_round: number;
  default_max_points_per_track: number;
  leagues: {
    id: string;
    name: string;
    admin_user_id: string;
  } | null;
};

export type SeasonListItem = {
  id: string;
  name: string;
  season_number: number;
  status: string;
  invite_token: string | null;
};

// Stale DB types (packages/db/types.ts) miss submissions_per_user on seasons,
// so supabase-js's select-parser rejects this select. Cast through unknown
// until types are regenerated.
const SEASON_SELECT =
  "id, name, season_number, status, league_id, submissions_per_user, default_points_per_round, default_max_points_per_track, leagues(id, name, admin_user_id)";

type SeasonRow = Omit<Season, "leagues"> & {
  leagues: Season["leagues"] | Season["leagues"][];
};

export async function getSeason(seasonId: string): Promise<Season | null> {
  const { data, error } = await supabase
    .from("seasons")
    .select(SEASON_SELECT as string)
    .eq("id", seasonId)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw postgresToMixError(error);
  }
  if (!data) return null;
  const row = data as unknown as SeasonRow;
  const league = Array.isArray(row.leagues) ? row.leagues[0] : row.leagues;
  return { ...row, leagues: league ?? null };
}

export async function getSeasonsForLeague(
  leagueId: string,
): Promise<SeasonListItem[]> {
  const { data, error } = await supabase
    .from("seasons")
    .select("id, name, season_number, status, invite_token")
    .eq("league_id", leagueId)
    .order("season_number", { ascending: false });
  if (error) throw postgresToMixError(error);
  return data ?? [];
}

export async function getActiveSeasonForLeague(
  leagueId: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("seasons")
    .select("id")
    .eq("league_id", leagueId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) throw postgresToMixError(error);
  return data;
}
