import { getValidAccessToken } from "@/lib/spotifyAuth";
import { auditMusicCredentials } from "@/lib/musicCredentialAudit";
import { NotAuthenticatedError, UnknownMixError } from "./errors";

export type SpotifyTrack = {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  duration_ms: number;
  external_ids: { isrc?: string };
  popularity: number;
};

// Pulls the track id out of a Spotify URL or URI. Returns null if the input
// isn't recognizable as a track reference — caller falls back to text search.
export function extractSpotifyTrackId(input: string): string | null {
  const urlMatch = input.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  const uriMatch = input.match(/spotify:track:([a-zA-Z0-9]+)/);
  if (uriMatch) return uriMatch[1];
  return null;
}

async function authedFetch(url: string): Promise<Response> {
  auditMusicCredentials("spotify.api.request", {
    provider: "spotify",
    credentialSource: "spotify-user-token",
    appleMusicCredentialsUsed: false,
  });
  const token = await getValidAccessToken();
  if (!token) throw new NotAuthenticatedError();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return res;
}

export async function searchSpotifyTracks(query: string): Promise<SpotifyTrack[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  auditMusicCredentials("submission.search.spotify", {
    provider: "spotify",
    query: trimmed,
    credentialSource: "spotify-user-token",
    appleMusicCredentialsUsed: false,
  });
  const res = await authedFetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(trimmed)}&type=track&limit=8`,
  );
  if (!res.ok) throw new UnknownMixError(`Spotify search failed (${res.status})`);
  const data = (await res.json()) as { tracks?: { items: SpotifyTrack[] } };
  const tracks = data.tracks?.items ?? [];
  auditMusicCredentials("submission.search.spotify.results", {
    provider: "spotify",
    resultCount: tracks.length,
    trackIds: tracks.map((t) => t.id),
  });
  return tracks;
}

export async function getSpotifyTrack(trackId: string): Promise<SpotifyTrack> {
  auditMusicCredentials("submission.lookup.spotify", {
    provider: "spotify",
    trackId,
    credentialSource: "spotify-user-token",
    appleMusicCredentialsUsed: false,
  });
  const res = await authedFetch(`https://api.spotify.com/v1/tracks/${trackId}`);
  if (!res.ok) throw new UnknownMixError(`Spotify lookup failed (${res.status})`);
  return (await res.json()) as SpotifyTrack;
}
