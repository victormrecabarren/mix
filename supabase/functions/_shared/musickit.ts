// Shared MusicKit helpers for edge functions.
// Generates an ES256 developer token from the MusicKit private key and provides
// catalog lookups that require only that token (no user auth, no subscription).

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64urlStr(s: string): string {
  return base64url(new TextEncoder().encode(s).buffer as ArrayBuffer);
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const der = Uint8Array.from(
    atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')),
    (c) => c.charCodeAt(0),
  );
  return crypto.subtle.importKey(
    'pkcs8',
    der.buffer as ArrayBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

export interface MusicKitConfig {
  keyId: string;
  teamId: string;
  privateKeyPem: string;
  // Token lifetime in seconds. Defaults to 180 days (Apple's maximum).
  lifetimeSecs?: number;
}

export async function generateDeveloperToken(
  config: MusicKitConfig,
): Promise<{ token: string; exp: number }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (config.lifetimeSecs ?? 15_552_000);

  const header = base64urlStr(JSON.stringify({ alg: 'ES256', kid: config.keyId }));
  const payload = base64urlStr(JSON.stringify({ iss: config.teamId, iat: now, exp }));
  const signingInput = `${header}.${payload}`;

  const key = await importPrivateKey(config.privateKeyPem);
  // Web Crypto returns ECDSA signatures already in raw r||s (IEEE P1363) form,
  // which is exactly what JWS ES256 requires — no DER conversion needed.
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );

  const signature = base64url(sig);
  return { token: `${signingInput}.${signature}`, exp };
}

export interface AppleMusicTrackLite {
  id: string;
  name: string;
  artistName: string;
  albumName: string;
  artworkUrl: string;
  durationMs: number;
  isrc?: string;
}

function normalizeArtworkUrl(url: string, size = 300): string {
  return url.replace('{w}', String(size)).replace('{h}', String(size));
}

// A song entry with its album relationship (attributes come inline when the
// request uses `include=albums`).
interface IsrcSongItem {
  attributes: { playParams?: unknown };
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
}

function albumMeta(it: IsrcSongItem) {
  return it.relationships?.albums?.data?.[0]?.attributes ?? {};
}

// `filter[isrc]` returns every catalog entry sharing that ISRC — the original
// album, singles, and every compilation the recording was licensed to — and
// Apple returns them unsorted, ALL with the same normalized release date. So
// date/order can't discriminate; the album's own flags can. Rank streamable
// entries by: real album over compilation, full album over single, then the
// smaller tracklist (standard edition over deluxe / mega-compilation).
function pickCanonicalIsrcMatch<T extends IsrcSongItem>(items: T[]): T | null {
  if (items.length === 0) return null;
  const streamable = items.filter((it) => it.attributes.playParams != null);
  const pool = streamable.length > 0 ? streamable : items;
  const score = (it: T): [number, number, number] => {
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

// Looks up an Apple Music catalog track by ISRC. Developer token only.
// storefront is an ISO 3166-1 alpha-2 country code (lowercase), e.g. 'us'.
// Returns null when the catalog has no match in that storefront.
export async function findAppleMusicTrackByIsrc(
  developerToken: string,
  isrc: string,
  storefront = 'us',
): Promise<AppleMusicTrackLite | null> {
  const url = `https://api.music.apple.com/v1/catalog/${storefront}/songs?filter[isrc]=${encodeURIComponent(isrc)}&include=albums`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${developerToken}` },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    data?: Array<
      IsrcSongItem & {
        id: string;
        attributes: {
          name: string;
          artistName: string;
          albumName: string;
          durationInMillis: number;
          isrc?: string;
          playParams?: unknown;
          artwork: { url: string };
        };
      }
    >;
  };
  const item = pickCanonicalIsrcMatch(data.data ?? []);
  if (!item) return null;
  return {
    id: item.id,
    name: item.attributes.name,
    artistName: item.attributes.artistName,
    albumName: item.attributes.albumName,
    artworkUrl: normalizeArtworkUrl(item.attributes.artwork.url),
    durationMs: item.attributes.durationInMillis,
    isrc: item.attributes.isrc,
  };
}
