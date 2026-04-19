import { supabase } from "@/lib/supabase";
import { postgresToMixError } from "./errors";

export type SeasonUpdate = {
  name?: string;
  submissionsPerUser?: number;
  defaultPointsPerRound?: number;
  defaultMaxPointsPerTrack?: number;
};

export type RoundUpdate = {
  prompt?: string;
  description?: string;
  submissionDeadlineAt?: Date | string;
  votingDeadlineAt?: Date | string;
};

export type CreateRoundArgs = {
  seasonId: string;
  roundNumber: number;
  prompt: string;
  description: string;
  submissionDeadlineAt: Date | string;
  votingDeadlineAt: Date | string;
};

function toIso(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}

export async function updateSeason(
  seasonId: string,
  patch: SeasonUpdate,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.submissionsPerUser !== undefined)
    row.submissions_per_user = patch.submissionsPerUser;
  if (patch.defaultPointsPerRound !== undefined)
    row.default_points_per_round = patch.defaultPointsPerRound;
  if (patch.defaultMaxPointsPerTrack !== undefined)
    row.default_max_points_per_track = patch.defaultMaxPointsPerTrack;

  const { error } = await supabase
    .from("seasons")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(row as any)
    .eq("id", seasonId);
  if (error) throw postgresToMixError(error);
}

export async function updateRound(
  roundId: string,
  patch: RoundUpdate,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.prompt !== undefined) row.prompt = patch.prompt;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.submissionDeadlineAt !== undefined)
    row.submission_deadline_at = toIso(patch.submissionDeadlineAt);
  if (patch.votingDeadlineAt !== undefined)
    row.voting_deadline_at = toIso(patch.votingDeadlineAt);

  const { error } = await supabase
    .from("rounds")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(row as any)
    .eq("id", roundId);
  if (error) throw postgresToMixError(error);
}

export async function createRound(args: CreateRoundArgs): Promise<void> {
  const { error } = await supabase.from("rounds").insert({
    season_id: args.seasonId,
    round_number: args.roundNumber,
    prompt: args.prompt,
    description: args.description,
    submission_deadline_at: toIso(args.submissionDeadlineAt),
    voting_deadline_at: toIso(args.votingDeadlineAt),
  });
  if (error) throw postgresToMixError(error);
}

// Sets voting_deadline_at = now() so getPhase() flips the round to results
// immediately. DB triggers pick up forfeits + playlist positions.
export async function forceEndRound(roundId: string): Promise<void> {
  const { error } = await supabase
    .from("rounds")
    .update({ voting_deadline_at: new Date().toISOString() })
    .eq("id", roundId);
  if (error) throw postgresToMixError(error);
}
