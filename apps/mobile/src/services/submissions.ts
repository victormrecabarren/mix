import { supabase } from "@/lib/supabase";
import { postgresToMixError } from "./errors";

// Shape passed by the UI for each track slot. Maps to columns in `submissions`.
export type TrackSelection = {
  spotifyTrackId: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  isrc: string | null;
  albumName: string | null;
  durationMs: number | null;
  popularity: number | null;
};

// One per slot. submissionId = null means "insert new"; otherwise "update".
export type SubmissionDraft = {
  submissionId: string | null;
  track: TrackSelection;
  comment: string;
};

export type SubmitRoundEntriesArgs = {
  roundId: string;
  userId: string;
  drafts: SubmissionDraft[];
};

function draftToColumns(draft: SubmissionDraft) {
  const { track } = draft;
  return {
    spotify_track_id: track.spotifyTrackId,
    track_title: track.title,
    track_artist: track.artist,
    track_artwork_url: track.artworkUrl,
    track_isrc: track.isrc ?? "",
    track_album_name: track.albumName,
    track_duration_ms: track.durationMs,
    track_popularity: track.popularity,
    comment: draft.comment.trim() || null,
  };
}

// Applies a user's full draft set to a round: updates for drafts with an
// existing submissionId, inserts for drafts without one. Runs updates first
// so inserts only fire after existing slots are consistent. DB-side triggers
// enforce deadline / quota / spectator rules; mapped to typed errors.
export async function submitRoundEntries(
  args: SubmitRoundEntriesArgs,
): Promise<void> {
  const updates = args.drafts.filter((d) => d.submissionId);
  const inserts = args.drafts.filter((d) => !d.submissionId);

  const updateResults = await Promise.all(
    updates.map((d) =>
      supabase
        .from("submissions")
        .update(draftToColumns(d))
        .eq("id", d.submissionId!)
        .eq("user_id", args.userId),
    ),
  );
  const updateErr = updateResults.find((r) => r.error)?.error;
  if (updateErr) throw postgresToMixError(updateErr);

  if (inserts.length > 0) {
    const rows = inserts.map((d) => ({
      round_id: args.roundId,
      user_id: args.userId,
      ...draftToColumns(d),
    }));
    const { error } = await supabase.from("submissions").insert(rows);
    if (error) throw postgresToMixError(error);
  }
}
