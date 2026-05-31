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

// ─── Historic conflict detection ─────────────────────────────────────────────

export type HistoricTrackConflict = {
  roundId: string;
  roundNumber: number;
  roundPrompt: string;
  seasonName: string;
  isMySubmission: boolean;
};

// Returns every prior submission in the league that matches the given track
// identifier, excluding the current round. Used to surface soft warnings at
// track-selection time (AC3: league history; AC4: user's own history).
// Queries in two steps to avoid deep nested join filter limitations.
// Fails open: callers catch and skip rather than blocking submission.
export async function getLeagueHistoricConflicts(args: {
  leagueId: string;
  currentRoundId: string;
  userId: string;
  spotifyIsrc?: string;
  soundcloudUrl?: string;
}): Promise<HistoricTrackConflict[]> {
  const { leagueId, currentRoundId, userId, spotifyIsrc, soundcloudUrl } = args;
  if (!spotifyIsrc && !soundcloudUrl) return [];

  type RoundMeta = {
    id: string;
    round_number: number;
    prompt: string;
    seasons: { name: string } | null;
  };

  const { data: roundsRaw, error: roundsErr } = await supabase
    .from("rounds")
    .select("id, round_number, prompt, seasons!inner(name)")
    .eq("seasons.league_id", leagueId)
    .neq("id", currentRoundId);
  if (roundsErr) throw postgresToMixError(roundsErr);

  const rounds = (roundsRaw ?? []) as unknown as RoundMeta[];
  if (rounds.length === 0) return [];

  const roundIds = rounds.map((r) => r.id);
  const roundById = new Map<string, RoundMeta>(rounds.map((r) => [r.id, r]));

  type SubRow = { user_id: string; round_id: string };
  let subRows: SubRow[];

  if (spotifyIsrc) {
    const { data, error } = await supabase
      .from("submissions")
      .select("user_id, round_id")
      .in("round_id", roundIds)
      .eq("track_source", "spotify")
      .eq("track_isrc", spotifyIsrc);
    if (error) throw postgresToMixError(error);
    subRows = (data ?? []) as SubRow[];
  } else {
    const { data, error } = await supabase
      .from("submissions")
      .select("user_id, round_id")
      .in("round_id", roundIds)
      .eq("track_source", "soundcloud")
      .eq("soundcloud_track_url", soundcloudUrl!);
    if (error) throw postgresToMixError(error);
    subRows = (data ?? []) as SubRow[];
  }

  return subRows.map((s) => {
    const round = roundById.get(s.round_id);
    return {
      roundId: s.round_id,
      roundNumber: round?.round_number ?? 0,
      roundPrompt: round?.prompt ?? "",
      seasonName: round?.seasons?.name ?? "",
      isMySubmission: s.user_id === userId,
    };
  });
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

// Resolve a submission's owning round id. Used by surfaces that only hold a
// submission id (e.g. the Now Playing modal, where a PlaylistTrack.id IS a
// submission id) and need to look up the round's phase / results / voters.
// Returns null when the id isn't a submission (e.g. a non-round playback
// source), so callers can fall back to a plain player with no round panel.
export async function getSubmissionRoundId(
  submissionId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("submissions")
    .select("round_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (error) throw postgresToMixError(error);
  return (data as { round_id: string } | null)?.round_id ?? null;
}
