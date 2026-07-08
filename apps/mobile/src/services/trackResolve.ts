import { UnknownMixError } from "./errors";
import { auditMusicCredentials } from "@/lib/musicCredentialAudit";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export type ResolvedSpotifyTrack = {
  id: string;
  name: string;
  artistName: string;
  albumName: string;
  artworkUrl: string;
  durationMs: number;
  isrc?: string;
};

export type ResolvedAppleMusicTrack = {
  id: string;
  name: string;
  artistName: string;
  albumName: string;
  artworkUrl: string;
  durationMs: number;
  isrc?: string;
};

export type ResolvedTrack = {
  isrc: string;
  spotify: ResolvedSpotifyTrack | null;
  appleMusic: ResolvedAppleMusicTrack | null;
};

// Resolves a recording to its Spotify and Apple Music catalog entries by ISRC.
// Calls the resolve-track edge function (which holds both sets of credentials).
// Either side may be null when that service's catalog has no match — callers
// gate submission eligibility on both being present.
export async function resolveTrackByIsrc(
  isrc: string,
  opts?: { appleStorefront?: string },
): Promise<ResolvedTrack> {
  auditMusicCredentials("submission.crossResolve.start", {
    isrc,
    edgeFunction: "resolve-track",
    credentialSource: "server-side-provider-credentials",
    spotifyUserCredentialsUsed: false,
    appleMusicUserCredentialsUsed: false,
  });
  const res = await fetch(`${SUPABASE_URL}/functions/v1/resolve-track`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ isrc, apple_storefront: opts?.appleStorefront }),
  });
  if (!res.ok) {
    auditMusicCredentials("submission.crossResolve.failed", {
      isrc,
      status: res.status,
      edgeFunction: "resolve-track",
    });
    throw new UnknownMixError(`Track resolution failed (${res.status})`);
  }
  const result = (await res.json()) as ResolvedTrack;
  auditMusicCredentials("submission.crossResolve.complete", {
    isrc,
    edgeFunction: "resolve-track",
    credentialSource: "server-side-provider-credentials",
    spotifyUserCredentialsUsed: false,
    appleMusicUserCredentialsUsed: false,
    hasSpotifyMatch: !!result.spotify,
    spotifyTrackId: result.spotify?.id ?? null,
    hasAppleMusicMatch: !!result.appleMusic,
    appleMusicId: result.appleMusic?.id ?? null,
  });
  return result;
}
