import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type Season = {
  id: string;
  name: string;
  season_number: number;
  status: string;
  league_id: string;
  submissions_per_user: number;
  default_points_per_round: number;
  default_max_points_per_track: number;
  invite_token: string;
  leagues: { id: string; name: string; admin_user_id: string } | null;
};

export type Round = {
  id: string;
  round_number: number;
  prompt: string;
  description: string;
  submission_deadline_at: string;
  voting_deadline_at: string;
};

// ─── Keys ─────────────────────────────────────────────────────────────────────
// Exporting keys as functions so we reuse them for prefetch / setQueryData.
export const seasonKeys = {
  all: ["seasons"] as const,
  byId: (id: string) => ["season", id] as const,
  rounds: (seasonId: string) => ["rounds", seasonId] as const,
  byLeague: (leagueId: string) => ["seasons", "league", leagueId] as const,
};

// ─── Fetchers ─────────────────────────────────────────────────────────────────
async function fetchSeason(id: string): Promise<Season | null> {
  const { data } = await supabase
    .from("seasons")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select(
      "id, name, season_number, status, league_id, submissions_per_user, default_points_per_round, default_max_points_per_track, invite_token, leagues(id, name, admin_user_id)" as any
    )
    .eq("id", id)
    .single();
  if (!data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = data as any;
  return {
    ...raw,
    leagues: Array.isArray(raw.leagues) ? raw.leagues[0] ?? null : raw.leagues,
  } as Season;
}

async function fetchSeasonsByLeague(leagueId: string) {
  const { data } = await supabase
    .from("seasons")
    .select("id, name, season_number, status, invite_token")
    .eq("league_id", leagueId)
    .order("season_number", { ascending: false });
  return data ?? [];
}

async function fetchRounds(seasonId: string): Promise<Round[]> {
  const { data } = await supabase
    .from("rounds")
    .select("id, round_number, prompt, description, submission_deadline_at, voting_deadline_at")
    .eq("season_id", seasonId)
    .order("round_number", { ascending: true });
  return data ?? [];
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
export function useSeason(seasonId: string | null | undefined) {
  return useQuery({
    queryKey: seasonId ? seasonKeys.byId(seasonId) : ["season", "disabled"],
    queryFn: () => (seasonId ? fetchSeason(seasonId) : null),
    enabled: !!seasonId,
  });
}

export function useSeasonsByLeague(leagueId: string | null | undefined) {
  return useQuery({
    queryKey: leagueId ? seasonKeys.byLeague(leagueId) : ["seasons", "league", "disabled"],
    queryFn: () => (leagueId ? fetchSeasonsByLeague(leagueId) : []),
    enabled: !!leagueId,
  });
}

export function useRounds(seasonId: string | null | undefined) {
  return useQuery({
    queryKey: seasonId ? seasonKeys.rounds(seasonId) : ["rounds", "disabled"],
    queryFn: () => (seasonId ? fetchRounds(seasonId) : []),
    enabled: !!seasonId,
  });
}
