// Generates a short-lived MusicKit developer token (ES256 JWT) for use by
// the mobile app when calling the Apple Music Catalog REST API.
// Requires three Supabase secrets (set via `supabase secrets set`):
//   MUSICKIT_PRIVATE_KEY  — PEM-encoded EC private key (.p8 from Apple Developer)
//   MUSICKIT_KEY_ID       — Key ID shown in Apple Developer Portal
//   MUSICKIT_TEAM_ID      — Apple Developer Team ID
import { generateDeveloperToken } from '../_shared/musickit.ts';

const MUSICKIT_KEY_ID = Deno.env.get('MUSICKIT_KEY_ID')!;
const MUSICKIT_TEAM_ID = Deno.env.get('MUSICKIT_TEAM_ID')!;
const MUSICKIT_PRIVATE_KEY = Deno.env.get('MUSICKIT_PRIVATE_KEY')!;
const ANON_KEY = Deno.env.get('ANON_KEY_JWT')!;

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Require the Supabase anon key so this endpoint isn't publicly callable.
  const auth = req.headers.get('Authorization');
  if (!auth || auth !== `Bearer ${ANON_KEY}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { token, exp } = await generateDeveloperToken({
      keyId: MUSICKIT_KEY_ID,
      teamId: MUSICKIT_TEAM_ID,
      privateKeyPem: MUSICKIT_PRIVATE_KEY,
    });
    return Response.json({ token, exp });
  } catch (e) {
    console.error('Failed to generate developer token:', e);
    return Response.json({ error: 'Failed to generate token' }, { status: 500 });
  }
});
