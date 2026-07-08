import { UnknownMixError } from "./errors";
import { auditMusicCredentials } from "@/lib/musicCredentialAudit";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export type AppleMusicTrack = {
  id: string;
  name: string;
  artistName: string;
  albumName: string;
  artworkUrl: string;
  durationMs: number;
  isrc?: string;
};

// Pulls the catalog song id out of an Apple Music URL. Song links carry the id
// in the `i` query param (e.g. .../album/name/123?i=456 → "456"); a bare song
// URL (.../song/name/456) carries it as the last path segment. Returns null if
// the input isn't recognizable as an Apple Music track reference.
export function extractAppleMusicTrackId(input: string): string | null {
  if (!/music\.apple\.com/.test(input)) return null;
  try {
    const url = new URL(input);
    const i = url.searchParams.get("i");
    if (i) return i;
    const songMatch = url.pathname.match(/\/song\/[^/]+\/(\d+)/);
    if (songMatch) return songMatch[1];
    return null;
  } catch {
    return null;
  }
}

// Developer tokens expire in up to 180 days; cache in memory until 60s before expiry.
let cachedDevToken: { token: string; exp: number } | null = null;

async function getDeveloperToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedDevToken && cachedDevToken.exp - now > 60) {
    auditMusicCredentials("appleMusic.developerToken.requested", {
      credentialSource: "musickit-developer-token-cache",
      usesAppleUserToken: false,
      usesSpotifyCredentials: false,
    });
    return cachedDevToken.token;
  }
  auditMusicCredentials("appleMusic.developerToken.requested", {
    credentialSource: "musickit-token-edge-function",
    usesAppleUserToken: false,
    usesSpotifyCredentials: false,
  });
  const res = await fetch(`${SUPABASE_URL}/functions/v1/musickit-token`, {
    headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new UnknownMixError(`Failed to get MusicKit developer token (${res.status})`);
  const { token, exp } = (await res.json()) as { token: string; exp: number };
  cachedDevToken = { token, exp };
  return token;
}

// Derive the user's App Store storefront from their device locale.
// Storefront = lowercase ISO 3166-1 alpha-2 country code, e.g. "us", "gb", "de".
function getStorefront(): string {
  try {
    const locale = new Intl.Locale(Intl.DateTimeFormat().resolvedOptions().locale);
    return locale.region?.toLowerCase() ?? 'us';
  } catch {
    return 'us';
  }
}

function normalizeArtworkUrl(url: string, size = 300): string {
  return url.replace('{w}', String(size)).replace('{h}', String(size));
}

type RawSongAttributes = {
  name: string;
  artistName: string;
  albumName: string;
  durationInMillis: number;
  isrc?: string;
  releaseDate?: string;
  playParams?: unknown;
  artwork: { url: string };
};

// A song entry with its album relationship (attributes come inline when the
// request uses `include=albums`).
type IsrcSongItem = {
  id: string;
  attributes: RawSongAttributes;
  relationships?: {
    albums?: {
      data?: Array<{
        attributes?: {
          isCompilation?: boolean;
          isSingle?: boolean;
          trackCount?: number;
        };
      }>;
    };
  };
};

function albumMeta(it: IsrcSongItem) {
  return it.relationships?.albums?.data?.[0]?.attributes ?? {};
}

// `filter[isrc]` returns every catalog entry sharing that ISRC (original album,
// singles, compilations), unsorted and ALL with the same normalized release
// date — so order/date can't discriminate. The album's own flags can. Rank
// streamable entries by: real album over compilation, full album over single,
// then the smaller tracklist (standard edition over deluxe / mega-compilation).
function pickCanonicalIsrcMatch(items: IsrcSongItem[]): IsrcSongItem | null {
  if (items.length === 0) return null;
  const streamable = items.filter((it) => it.attributes.playParams != null);
  const pool = streamable.length > 0 ? streamable : items;
  const score = (it: IsrcSongItem): [number, number, number] => {
    const a = albumMeta(it);
    return [
      a.isCompilation ? 1 : 0,
      a.isSingle ? 1 : 0,
      a.trackCount ?? Number.MAX_SAFE_INTEGER,
    ];
  };
  return pool.reduce((best, it) => {
    const [bc, bs, bt] = score(best);
    const [ic, is, it_] = score(it);
    if (ic !== bc) return ic < bc ? it : best;
    if (is !== bs) return is < bs ? it : best;
    return it_ < bt ? it : best;
  });
}

function toAppleMusicTrack(id: string, attrs: RawSongAttributes): AppleMusicTrack {
  return {
    id,
    name: attrs.name,
    artistName: attrs.artistName,
    albumName: attrs.albumName,
    artworkUrl: normalizeArtworkUrl(attrs.artwork.url),
    durationMs: attrs.durationInMillis,
    isrc: attrs.isrc,
  };
}

export async function searchAppleMusicTracks(query: string): Promise<AppleMusicTrack[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const developerToken = await getDeveloperToken();
  const storefront = getStorefront();
  auditMusicCredentials("submission.search.appleMusic", {
    provider: "applemusic",
    query: trimmed,
    storefront,
    credentialSource: "musickit-developer-token",
    usesAppleUserToken: false,
    spotifyCredentialsUsed: false,
  });
  const url = `https://api.music.apple.com/v1/catalog/${storefront}/search?term=${encodeURIComponent(trimmed)}&types=songs&limit=8`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${developerToken}` },
  });
  if (!res.ok) throw new UnknownMixError(`Apple Music search failed (${res.status})`);

  const data = (await res.json()) as {
    results?: {
      songs?: {
        data: Array<{ id: string; attributes: RawSongAttributes }>;
      };
    };
  };
  const tracks = (data.results?.songs?.data ?? []).map((item) =>
    toAppleMusicTrack(item.id, item.attributes),
  );
  console.log("[mix-debug] searchAppleMusicTracks", {
    query: trimmed,
    storefront,
    results: tracks.map((t) => ({
      id: t.id,
      name: t.name,
      album: t.albumName,
      isrc: t.isrc,
    })),
  });
  return tracks;
}

export async function getAppleMusicTrack(id: string): Promise<AppleMusicTrack> {
  const developerToken = await getDeveloperToken();
  const storefront = getStorefront();
  auditMusicCredentials("submission.lookup.appleMusic", {
    provider: "applemusic",
    trackId: id,
    storefront,
    credentialSource: "musickit-developer-token",
    usesAppleUserToken: false,
    spotifyCredentialsUsed: false,
  });
  const url = `https://api.music.apple.com/v1/catalog/${storefront}/songs/${id}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${developerToken}` },
  });
  if (!res.ok) throw new UnknownMixError(`Apple Music track lookup failed (${res.status})`);

  const data = (await res.json()) as {
    data: Array<{ id: string; attributes: RawSongAttributes }>;
  };
  const item = data.data[0];
  if (!item) throw new UnknownMixError('Apple Music track not found');
  return toAppleMusicTrack(item.id, item.attributes);
}

// Looks up an Apple Music catalog track by ISRC.
// Used for cross-platform eligibility: a Spotify submission is only valid if it
// also exists in the Apple Music catalog (same ISRC). Returns null when no match.
export async function findAppleMusicTrackByIsrc(isrc: string): Promise<AppleMusicTrack | null> {
  const developerToken = await getDeveloperToken();
  const storefront = getStorefront();
  auditMusicCredentials("submission.resolve.appleMusicByIsrc", {
    provider: "applemusic",
    isrc,
    storefront,
    credentialSource: "musickit-developer-token",
    usesAppleUserToken: false,
    spotifyCredentialsUsed: false,
  });
  const url = `https://api.music.apple.com/v1/catalog/${storefront}/songs?filter[isrc]=${encodeURIComponent(isrc)}&include=albums`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${developerToken}` },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { data?: IsrcSongItem[] };
  const item = pickCanonicalIsrcMatch(data.data ?? []);
  return item ? toAppleMusicTrack(item.id, item.attributes) : null;
}
