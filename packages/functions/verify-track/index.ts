import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID')!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET')!;
const APPLE_MUSICKIT_TOKEN = Deno.env.get('APPLE_MUSICKIT_TOKEN')!; // pre-signed or generate here

interface VerifyTrackRequest {
  platform: 'spotify' | 'apple_music';
  trackId: string;
  market?: string;
}

interface VerifyTrackResponse {
  valid: boolean;
  isrc?: string;
  spotifyTrackId?: string;
  appleMusicTrackId?: string;
  trackTitle?: string;
  trackArtist?: string;
  trackArtworkUrl?: string;
  error?: string;
}

async function getSpotifyClientToken(): Promise<string> {
  const credentials = btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  return data.access_token;
}

async function fetchIsrcFromSpotify(trackId: string, token: string): Promise<string | null> {
  const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.external_ids?.isrc ?? null;
}

async function fetchIsrcFromAppleMusic(trackId: string): Promise<string | null> {
  const res = await fetch(
    `https://api.music.apple.com/v1/catalog/us/songs/${trackId}`,
    { headers: { Authorization: `Bearer ${APPLE_MUSICKIT_TOKEN}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.data?.[0]?.attributes?.isrc ?? null;
}

async function verifyIsrcOnSpotify(
  isrc: string,
  market: string,
  token: string
): Promise<{ trackId: string; title: string; artist: string; artworkUrl: string } | null> {
  const url = `https://api.spotify.com/v1/search?q=isrc:${isrc}&type=track&market=${market}&limit=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const data = await res.json();
  const track = data.tracks?.items?.[0];
  if (!track) return null;
  return {
    trackId: track.id,
    title: track.name,
    artist: track.artists.map((a: { name: string }) => a.name).join(', '),
    artworkUrl: track.album?.images?.[0]?.url ?? '',
  };
}

async function verifyIsrcOnAppleMusic(
  isrc: string
): Promise<{ trackId: string } | null> {
  const url = `https://api.music.apple.com/v1/catalog/us/songs?filter[isrc]=${isrc}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${APPLE_MUSICKIT_TOKEN}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const track = data.data?.[0];
  if (!track) return null;
  return { trackId: track.id };
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const body: VerifyTrackRequest = await req.json();
  const { platform, trackId, market = 'US' } = body;

  const spotifyToken = await getSpotifyClientToken();

  let isrc: string | null = null;
  let sourceTitle = '';
  let sourceArtist = '';
  let sourceArtworkUrl = '';

  if (platform === 'spotify') {
    isrc = await fetchIsrcFromSpotify(trackId, spotifyToken);
  } else {
    isrc = await fetchIsrcFromAppleMusic(trackId);
  }

  if (!isrc) {
    const response: VerifyTrackResponse = {
      valid: false,
      error: 'This track cannot be verified across platforms. Please choose another track.',
    };
    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const [spotifyResult, appleMusicResult] = await Promise.all([
    verifyIsrcOnSpotify(isrc, market, spotifyToken),
    verifyIsrcOnAppleMusic(isrc),
  ]);

  if (!spotifyResult || !appleMusicResult) {
    const response: VerifyTrackResponse = {
      valid: false,
      error: 'This track is not available on both Spotify and Apple Music. Please choose a different track.',
    };
    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (platform === 'spotify') {
    sourceTitle = spotifyResult.title;
    sourceArtist = spotifyResult.artist;
    sourceArtworkUrl = spotifyResult.artworkUrl;
  }

  const response: VerifyTrackResponse = {
    valid: true,
    isrc,
    spotifyTrackId: spotifyResult.trackId,
    appleMusicTrackId: appleMusicResult.trackId,
    trackTitle: sourceTitle,
    trackArtist: sourceArtist,
    trackArtworkUrl: sourceArtworkUrl,
  };

  return new Response(JSON.stringify(response), {
    headers: { 'Content-Type': 'application/json' },
  });
});
