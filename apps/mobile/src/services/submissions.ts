import { supabase } from "@/lib/supabase";
import { postgresToMixError } from "./errors";

// Shape passed by the UI for each track slot. Discriminated by `source`;
// each branch carries the fields needed to populate the matching DB columns.
// A single submission row carries exactly one source's identity — the DB has
// a check constraint that enforces this.
export type TrackSelection =
  | {
      source: "spotify";
      spotifyTrackId: string;
      title: string;
      artist: string;
      artworkUrl: string | null;
      isrc: string | null;
      albumName: string | null;
      durationMs: number | null;
      popularity: number | null;
    }
  | {
      source: "soundcloud";
      soundcloudTrackUrl: string;
      title: string;
      artist: string;
      artworkUrl: string | null;
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
  const common = {
    track_title: track.title,
    track_artist: track.artist,
    track_artwork_url: track.artworkUrl,
    comment: draft.comment.trim() || null,
  };
  if (track.source === "spotify") {
    return {
      ...common,
      track_source: "spotify" as const,
      spotify_track_id: track.spotifyTrackId,
      soundcloud_track_url: null,
      track_isrc: track.isrc ?? "",
      track_album_name: track.albumName,
      track_duration_ms: track.durationMs,
      track_popularity: track.popularity,
    };
  }
  // SoundCloud: no ISRC / popularity / album-name / Spotify duration.
  // track_isrc is NOT NULL in the schema, so we stash an empty string —
  // matches the existing pattern for Spotify tracks missing an ISRC.
  return {
    ...common,
    track_source: "soundcloud" as const,
    spotify_track_id: null,
    soundcloud_track_url: track.soundcloudTrackUrl,
    track_isrc: "",
    track_album_name: null,
    track_duration_ms: null,
    track_popularity: null,
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

// ─── Batched submission counts ────────────────────────────────────────────────
// Returns a map of roundId → submission count for the requested rounds.
// One Supabase query: PostgREST doesn't support server-side GROUP BY, so we
// fetch the `round_id` column for the requested rounds and tally client-side.
// This is fine at our scale (a season has O(10) rounds, each with O(10)
// submissions); revisit with an RPC if rows grow into the thousands.
// Rounds with zero submissions are simply absent from the map; callers should
// default to 0 when reading.
export async function getSubmissionCountsForRounds(
  roundIds: string[],
): Promise<Record<string, number>> {
  if (roundIds.length === 0) return {};

  const { data, error } = await supabase
    .from("submissions")
    .select("round_id")
    .in("round_id", roundIds);
  if (error) throw postgresToMixError(error);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const key = (row as { round_id: string }).round_id;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
