import { supabase } from "@/lib/supabase";
import { postgresToMixError, UnknownMixError } from "./errors";
import { clearVoteDraft } from "./voteDrafts";

// The voter's view of a submission. Intentionally narrower than the full row —
// results phase reads more columns via its own service when we get there.
export type VotingSubmission = {
  id: string;
  user_id: string;
  track_title: string;
  track_artist: string;
  track_artwork_url: string | null;
  track_album_name: string | null;
  track_source: "spotify" | "soundcloud";
  spotify_track_id: string | null;
  soundcloud_track_url: string | null;
  track_isrc: string;
  comment: string | null;
  playlist_position: number | null;
};

export type VoteInput = { submissionId: string; points: number };
export type VoteCommentInput = { submissionId: string; body: string };

export type SubmitVotesArgs = {
  roundId: string;
  userId: string;
  votes: VoteInput[];
  comments?: VoteCommentInput[];
};

export async function getRoundSubmissions(
  roundId: string,
): Promise<VotingSubmission[]> {
  const { data, error } = await supabase
    .from("submissions")
    .select(
      "id, user_id, track_title, track_artist, track_artwork_url, track_album_name, track_source, spotify_track_id, soundcloud_track_url, track_isrc, comment, playlist_position",
    )
    .eq("round_id", roundId)
    .order("playlist_position", { ascending: true, nullsFirst: false });
  if (error) throw postgresToMixError(error);
  // Cast through unknown: `packages/db/types.ts` is stale and doesn't know
  // about the new `track_source` / `soundcloud_track_url` columns yet.
  return (data ?? []) as unknown as VotingSubmission[];
}

// Map of submissionId -> points the voter already allocated. Empty object if
// they haven't voted yet.
export async function getMyVotes(
  roundId: string,
  userId: string,
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("votes")
    .select("submission_id, points")
    .eq("round_id", roundId)
    .eq("voter_user_id", userId);
  if (error) throw postgresToMixError(error);
  const map: Record<string, number> = {};
  for (const row of data ?? []) {
    map[row.submission_id] = row.points;
  }
  return map;
}

// Submit votes + optional per-submission comments. The RPC is atomic; comments
// are a separate insert that runs only if the RPC succeeded. If comments fail
// after votes land, the votes still persist and we surface an UnknownMixError.
// Wrapping both in a single DB function is a worthwhile follow-up.
export async function submitVotes(args: SubmitVotesArgs): Promise<void> {
  const p_votes = args.votes
    .filter((v) => v.points > 0)
    .map((v) => ({ submission_id: v.submissionId, points: v.points }));

  const { error: voteError } = await supabase.rpc("submit_votes", {
    p_round_id: args.roundId,
    p_voter_user_id: args.userId,
    p_votes,
  });
  if (voteError) throw postgresToMixError(voteError);

  const commentRows = (args.comments ?? [])
    .filter((c) => c.body.trim().length > 0)
    .map((c) => ({
      round_id: args.roundId,
      submission_id: c.submissionId,
      author_user_id: args.userId,
      body: c.body.trim(),
    }));

  if (commentRows.length > 0) {
    const { error: commentError } = await supabase
      .from("comments")
      .insert(commentRows);
    if (commentError) {
      throw new UnknownMixError(
        `Votes saved but comments failed: ${commentError.message}`,
        { cause: commentError },
      );
    }
  }

  // The real ballot is in now — drop the persisted draft so it can't resurface.
  // Best-effort: a lingering draft is ignored once the user has voted, so a
  // failure here isn't worth surfacing to the caller.
  try {
    await clearVoteDraft(args.roundId, args.userId);
  } catch {
    // ignore — draft cleanup is non-critical
  }
}
