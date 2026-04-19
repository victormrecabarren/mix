import { supabase } from "@/lib/supabase";
import { postgresToMixError } from "./errors";

export type SeasonStanding = {
  user_id: string;
  display_name: string;
  total_points: number;
  rounds_played: number;
  rounds_forfeited: number;
  member_role: "participant" | "spectator";
};

export type SeasonAggregates = {
  // Map of roundId -> distinct user_ids who submitted at least once.
  submittersByRound: Record<string, string[]>;
  // Map of roundId -> distinct voter_user_ids who cast a vote.
  votersByRound: Record<string, string[]>;
  // Map of roundId -> count of round_participants flagged is_void.
  forfeitsByRound: Record<string, number>;
};

export async function getSeasonStandings(
  seasonId: string,
): Promise<SeasonStanding[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("get_season_standings", {
    p_season_id: seasonId,
  });
  if (error) throw postgresToMixError(error);
  return (data ?? []) as SeasonStanding[];
}

// Per-round counts of submitters / voters / forfeits across a season, used by
// SeasonScreen's round cards. Fetched in a single trip for all rounds in the
// season.
export async function getSeasonAggregates(
  seasonId: string,
): Promise<SeasonAggregates> {
  const { data: roundsData, error: roundsErr } = await supabase
    .from("rounds")
    .select("id")
    .eq("season_id", seasonId);
  if (roundsErr) throw postgresToMixError(roundsErr);

  const roundIds = (roundsData ?? []).map((r) => r.id);
  if (roundIds.length === 0) {
    return { submittersByRound: {}, votersByRound: {}, forfeitsByRound: {} };
  }

  const [subsRes, votesRes, participantsRes] = await Promise.all([
    supabase
      .from("submissions")
      .select("round_id, user_id")
      .in("round_id", roundIds),
    supabase
      .from("votes")
      .select("round_id, voter_user_id")
      .in("round_id", roundIds),
    supabase
      .from("round_participants")
      .select("round_id, is_void")
      .in("round_id", roundIds),
  ]);
  if (subsRes.error) throw postgresToMixError(subsRes.error);
  if (votesRes.error) throw postgresToMixError(votesRes.error);
  if (participantsRes.error) throw postgresToMixError(participantsRes.error);

  const submittersByRound: Record<string, string[]> = {};
  for (const s of subsRes.data ?? []) {
    if (!submittersByRound[s.round_id]) submittersByRound[s.round_id] = [];
    if (!submittersByRound[s.round_id].includes(s.user_id))
      submittersByRound[s.round_id].push(s.user_id);
  }

  const votersByRound: Record<string, string[]> = {};
  for (const v of votesRes.data ?? []) {
    if (!votersByRound[v.round_id]) votersByRound[v.round_id] = [];
    if (!votersByRound[v.round_id].includes(v.voter_user_id))
      votersByRound[v.round_id].push(v.voter_user_id);
  }

  const forfeitsByRound: Record<string, number> = {};
  for (const p of participantsRes.data ?? []) {
    if (p.is_void)
      forfeitsByRound[p.round_id] = (forfeitsByRound[p.round_id] ?? 0) + 1;
  }

  return { submittersByRound, votersByRound, forfeitsByRound };
}
