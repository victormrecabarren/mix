import { normalizeSpotifyTrackUri } from "@/lib/spotifyTrackUri";
import type { PlaylistTrack } from "@/playback/PlaybackContext";

// The subset of a submission row needed to build a playable track. Both
// VotingSubmission (services/votes.ts) and the RoundScreen Submission type
// satisfy this shape.
export interface PlayableSubmission {
  id: string;
  track_title: string;
  track_artist: string;
  track_artwork_url: string | null;
  track_source: "spotify" | "soundcloud" | "applemusic";
  spotify_track_id: string | null;
  soundcloud_track_url: string | null;
  apple_music_id: string | null;
  track_isrc: string;
}

export type ListenerService = "spotify" | "applemusic";

// Builds a PlaylistTrack for a given listener. The submission's original
// `track_source` is attribution only — playback always routes through the
// LISTENER's service:
//   - SoundCloud rows stream via the SoundCloud player for everyone.
//   - Music rows play through the listener's service using whichever catalog ID
//     matches it (both are stored at submission time after ISRC cross-resolution).
// Returns null when the track can't be played for this listener — e.g. a legacy
// row that predates cross-resolution and lacks the listener's catalog ID.
export function submissionToPlaylistTrack(
  s: PlayableSubmission,
  listener: ListenerService,
): PlaylistTrack | null {
  const common = {
    id: s.id,
    title: s.track_title,
    artist: s.track_artist,
    artworkUrl: s.track_artwork_url ?? "",
    durationMs: 0,
  };

  if (s.track_source === "soundcloud") {
    if (!s.soundcloud_track_url) return null;
    return { ...common, source: "soundcloud", uri: s.soundcloud_track_url };
  }

  // Music track — route to the listener's service.
  if (listener === "applemusic") {
    if (!s.apple_music_id) return null;
    return {
      ...common,
      source: "applemusic",
      uri: s.apple_music_id,
      // ISRC lets the native player recover if the stored catalog id doesn't
      // resolve in the listener's storefront (ids aren't storefront-stable).
      isrc: s.track_isrc || undefined,
    };
  }

  if (!s.spotify_track_id) return null;
  return {
    ...common,
    source: "spotify",
    uri: normalizeSpotifyTrackUri(s.spotify_track_id),
  };
}
