// Cross-platform track resolution by ISRC.
//
// Given an ISRC, returns the matching catalog track on BOTH Spotify and Apple
// Music. Used at submission time to enforce the "must exist on both services"
// rule and to store both catalog IDs on the submission row.
//
// Runs server-side because:
//   - Spotify lookups need the client secret (client-credentials flow), which
//     can't ship in the app — and an Apple-logged-in user has no Spotify token.
//   - Apple lookups need the MusicKit developer token (private key stays server-side).
//
// No Apple Music subscription is required: catalog lookups are subscription-free.
//
// Secrets required (supabase secrets set ...):
//   MUSICKIT_KEY_ID, MUSICKIT_TEAM_ID, MUSICKIT_PRIVATE_KEY
//   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
import { generateDeveloperToken, findAppleMusicTrackByIsrc } from '../_shared/musickit.ts';
import { getSpotifyAppToken, findSpotifyTrackByIsrc } from '../_shared/spotify.ts';

const MUSICKIT_KEY_ID = Deno.env.get('MUSICKIT_KEY_ID')!;
const MUSICKIT_TEAM_ID = Deno.env.get('MUSICKIT_TEAM_ID')!;
const MUSICKIT_PRIVATE_KEY = Deno.env.get('MUSICKIT_PRIVATE_KEY')!;
const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID')!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET')!;
const ANON_KEY = Deno.env.get('ANON_KEY_JWT')!;

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const auth = req.headers.get('Authorization');
  if (!auth || auth !== `Bearer ${ANON_KEY}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let isrc: string;
  let appleStorefront: string;
  try {
    const body = await req.json() as { isrc?: string; apple_storefront?: string };
    if (!body.isrc) throw new Error('Missing isrc');
    isrc = body.isrc.trim();
    appleStorefront = (body.apple_storefront ?? 'us').toLowerCase();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const [{ token: developerToken }, spotifyToken] = await Promise.all([
      generateDeveloperToken({
        keyId: MUSICKIT_KEY_ID,
        teamId: MUSICKIT_TEAM_ID,
        privateKeyPem: MUSICKIT_PRIVATE_KEY,
        lifetimeSecs: 3600,
      }),
      getSpotifyAppToken(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET),
    ]);

    const [appleMusic, spotify] = await Promise.all([
      findAppleMusicTrackByIsrc(developerToken, isrc, appleStorefront),
      findSpotifyTrackByIsrc(spotifyToken, isrc),
    ]);

    return Response.json({ isrc, spotify, appleMusic });
  } catch (e) {
    console.error('resolve-track failed:', e);
    return Response.json(
      { error: 'Resolution failed', detail: (e as Error).message },
      { status: 500 },
    );
  }
});
