import { supabase } from "@/lib/supabase";
import { postgresToMixError } from "./errors";

export type RoundResult = {
  submission_id: string;
  user_id: string;
  display_name: string;
  track_title: string;
  track_artist: string;
  track_artwork_url: string | null;
  spotify_track_id: string | null;
  track_isrc: string;
  points_raw: number;
  points_effective: number;
  is_void: boolean;
};

export type VoterEntry = {
  voter_user_id: string;
  voter_name: string;
  points: number;
  comment: string | null;
};

export async function getRoundResults(roundId: string): Promise<RoundResult[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("get_round_results", {
    p_round_id: roundId,
  });
  if (error) throw postgresToMixError(error);
  return (data ?? []) as RoundResult[];
}

// Fetches votes (with voter display names) + per-voter comments, grouped by
// submission and sorted by points desc. This is the shape ResultsPhase needs.
export async function getRoundVotersBySubmission(
  roundId: string,
): Promise<Record<string, VoterEntry[]>> {
  const [votesRes, commentsRes] = await Promise.all([
    supabase
      .from("votes")
      .select("submission_id, points, voter_user_id, users(display_name)")
      .eq("round_id", roundId),
    supabase
      .from("comments")
      .select("submission_id, body, author_user_id")
      .eq("round_id", roundId),
  ]);
  if (votesRes.error) throw postgresToMixError(votesRes.error);
  if (commentsRes.error) throw postgresToMixError(commentsRes.error);

  const commentLookup: Record<string, Record<string, string>> = {};
  for (const c of commentsRes.data ?? []) {
    if (!commentLookup[c.submission_id]) commentLookup[c.submission_id] = {};
    commentLookup[c.submission_id][c.author_user_id] = c.body;
  }

  const voterMap: Record<string, VoterEntry[]> = {};
  for (const v of votesRes.data ?? []) {
    if (!voterMap[v.submission_id]) voterMap[v.submission_id] = [];
    const users = v.users as { display_name: string } | { display_name: string }[] | null;
    const name =
      (Array.isArray(users) ? users[0]?.display_name : users?.display_name) ??
      "Unknown";
    voterMap[v.submission_id].push({
      voter_user_id: v.voter_user_id,
      voter_name: name,
      points: v.points,
      comment: commentLookup[v.submission_id]?.[v.voter_user_id] ?? null,
    });
  }
  for (const entries of Object.values(voterMap)) {
    entries.sort((a, b) => b.points - a.points);
  }
  return voterMap;
}
