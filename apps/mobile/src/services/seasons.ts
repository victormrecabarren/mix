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

// UX pre-flight: is any round in this league still in progress (voting hasn't
// closed). Used to show a friendly message before trying to create a new
// season. The DB still rejects independently — this is purely for the nice
// error path.
export async function hasInProgressSeason(leagueId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("rounds")
    .select("id, seasons!inner(league_id)")
    .gt("voting_deadline_at", new Date().toISOString())
    .eq("seasons.league_id", leagueId);
  if (error) throw postgresToMixError(error);
  return (data ?? []).length > 0;
}

export type CreateSeasonRoundInput = {
  prompt: string;
  description: string;
  submissionDeadlineAt: Date | string;
  votingDeadlineAt: Date | string;
};

export type CreateSeasonArgs = {
  leagueId: string;
  name: string;
  participantCap?: number | null;
  submissionsPerUser: number;
  defaultPointsPerRound: number;
  defaultMaxPointsPerTrack: number;
  rounds: CreateSeasonRoundInput[];
};

function toIso(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}

// Creates a season + its rounds. Season number is derived from the existing
// count for the league. Not transactional across the two inserts — in
// practice this is commissioner-only and low-volume, but the DB guard on
// in-progress seasons still protects against duplicate season creation.
export async function createSeason(
  args: CreateSeasonArgs,
): Promise<{ seasonId: string }> {
  const { count, error: countErr } = await supabase
    .from("seasons")
    .select("id", { count: "exact", head: true })
    .eq("league_id", args.leagueId);
  if (countErr) throw postgresToMixError(countErr);

  const { data: seasonData, error: seasonErr } = await supabase
    .from("seasons")
    .insert({
      league_id: args.leagueId,
      name: args.name,
      season_number: (count ?? 0) + 1,
      participant_cap: args.participantCap ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      submissions_per_user: args.submissionsPerUser,
      default_points_per_round: args.defaultPointsPerRound,
      default_max_points_per_track: args.defaultMaxPointsPerTrack,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .select("id")
    .single();
  if (seasonErr) throw postgresToMixError(seasonErr);
  if (!seasonData?.id) throw new Error("Season insert returned no id");

  const { error: roundsErr } = await supabase.from("rounds").insert(
    args.rounds.map((r, i) => ({
      season_id: seasonData.id,
      round_number: i + 1,
      prompt: r.prompt,
      description: r.description,
      submission_deadline_at: toIso(r.submissionDeadlineAt),
      voting_deadline_at: toIso(r.votingDeadlineAt),
    })),
  );
  if (roundsErr) throw postgresToMixError(roundsErr);

  return { seasonId: seasonData.id };
}

export async function getSeasonInviteToken(
  seasonId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("seasons")
    .select("invite_token")
    .eq("id", seasonId)
    .maybeSingle();
  if (error) throw postgresToMixError(error);
  return data?.invite_token ?? null;
}

export function buildInviteLink(token: string): string {
  return `mix://join?token=${token}`;
}
