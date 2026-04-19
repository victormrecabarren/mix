import { supabase } from "@/lib/supabase";
import { postgresToMixError } from "./errors";

export type Round = {
  id: string;
  round_number: number;
  prompt: string;
  description: string;
  submission_deadline_at: string;
  voting_deadline_at: string;
  season_id: string;
  seasons: {
    id: string;
    name: string;
    status: string;
    submissions_per_user: number;
    default_points_per_round: number;
    default_max_points_per_track: number;
    league_id: string;
  } | null;
};

export type SiblingRound = {
  id: string;
  round_number: number;
  prompt: string;
  voting_deadline_at: string;
};

export type RoundListItem = {
  id: string;
  round_number: number;
  prompt: string;
  description: string;
  submission_deadline_at: string;
  voting_deadline_at: string;
};

const ROUND_SELECT =
  "id, round_number, prompt, description, submission_deadline_at, voting_deadline_at, season_id, seasons(id, name, status, submissions_per_user, default_points_per_round, default_max_points_per_track, league_id)";

export async function getRound(roundId: string): Promise<Round | null> {
  const { data, error } = await supabase
    .from("rounds")
    .select(ROUND_SELECT)
    .eq("id", roundId)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null; // no rows
    throw postgresToMixError(error);
  }
  if (!data) return null;

  // The TS type for nested single-row joins via supabase-js comes through as
  // an array in some schema versions; normalize to a single object for the
  // domain shape.
  const season = Array.isArray(data.seasons) ? data.seasons[0] : data.seasons;
  return { ...data, seasons: season ?? null };
}

export async function getPreviousRound(
  seasonId: string,
  currentRoundNumber: number,
): Promise<SiblingRound | null> {
  if (currentRoundNumber <= 1) return null;
  const { data, error } = await supabase
    .from("rounds")
    .select("id, round_number, prompt, voting_deadline_at")
    .eq("season_id", seasonId)
    .eq("round_number", currentRoundNumber - 1)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw postgresToMixError(error);
  }
  return data;
}

export async function getRoundsForSeason(
  seasonId: string,
): Promise<RoundListItem[]> {
  const { data, error } = await supabase
    .from("rounds")
    .select(
      "id, round_number, prompt, description, submission_deadline_at, voting_deadline_at",
    )
    .eq("season_id", seasonId)
    .order("round_number", { ascending: true });
  if (error) throw postgresToMixError(error);
  return data ?? [];
}

export async function getRoundCountForSeason(seasonId: string): Promise<number> {
  const { count, error } = await supabase
    .from("rounds")
    .select("id", { count: "exact", head: true })
    .eq("season_id", seasonId);
  if (error) throw postgresToMixError(error);
  return count ?? 0;
}

export type ActiveRoundLookup = {
  round: { roundId: string; seasonId: string } | null;
  hasActiveSeason: boolean;
};

// Finds the currently-open round for a league — earliest round whose voting
// deadline hasn't passed, within the league's active season. Returns a
// discriminated shape so callers can distinguish "no active season" from
// "active season but all rounds closed" without extra lookups.
export async function getActiveRoundForLeague(
  leagueId: string,
): Promise<ActiveRoundLookup> {
  const { data: season, error: seasonErr } = await supabase
    .from("seasons")
    .select("id")
    .eq("league_id", leagueId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (seasonErr) throw postgresToMixError(seasonErr);
  if (!season) return { round: null, hasActiveSeason: false };

  const { data: round, error: roundErr } = await supabase
    .from("rounds")
    .select("id")
    .eq("season_id", season.id)
    .gt("voting_deadline_at", new Date().toISOString())
    .order("round_number", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (roundErr) throw postgresToMixError(roundErr);

  return {
    round: round ? { roundId: round.id, seasonId: season.id } : null,
    hasActiveSeason: true,
  };
}
