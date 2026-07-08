// Shared Spotify helpers for edge functions.
// Uses the client-credentials flow (app-level token from client_id + secret) so
// catalog lookups work without any logged-in Spotify user — required when an
// Apple Music user submits a track and we need to verify it on Spotify.

export interface SpotifyTrackLite {
  id: string;
  name: string;
  artistName: string;
  albumName: string;
  artworkUrl: string;
  durationMs: number;
  isrc?: string;
}

// Fetches an app-level access token. Tokens last ~1 hour; callers within a
// single invocation reuse the returned token, so no cross-request cache here.
export async function getSpotifyAppToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
  });
  if (!res.ok) throw new Error(`Spotify token request failed (${res.status})`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

type RawSpotifyTrack = {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  duration_ms: number;
  external_ids?: { isrc?: string };
};

function toLite(t: RawSpotifyTrack): SpotifyTrackLite {
  return {
    id: t.id,
    name: t.name,
    artistName: t.artists.map((a) => a.name).join(', '),
    albumName: t.album.name,
    artworkUrl: t.album.images[0]?.url ?? '',
    durationMs: t.duration_ms,
    isrc: t.external_ids?.isrc,
  };
}

// Looks up a Spotify track by ISRC via the search API's `isrc:` filter.
// Returns null when nothing matches.
export async function findSpotifyTrackByIsrc(
  token: string,
  isrc: string,
): Promise<SpotifyTrackLite | null> {
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(`isrc:${isrc}`)}&type=track&limit=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const data = (await res.json()) as { tracks?: { items: RawSpotifyTrack[] } };
  const item = data.tracks?.items?.[0];
  return item ? toLite(item) : null;
}
