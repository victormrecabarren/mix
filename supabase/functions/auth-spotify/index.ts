import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Use explicitly set JWT key — the auto-injected SUPABASE_ANON_KEY may be
// the new sb_publishable_* format which the auth API rejects for signInWithPassword.
const SUPABASE_ANON_KEY = Deno.env.get('ANON_KEY_JWT')!;
// Secret used to derive a stable per-user password server-side.
// Set via: supabase secrets set USER_AUTH_SECRET=<random-string>
const USER_AUTH_SECRET = Deno.env.get('USER_AUTH_SECRET')!;

// Derives a stable base64url password from the Spotify user ID + server secret.
// Never exposed to the client — only used inside this function.
async function deriveStablePassword(spotifyId: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(USER_AUTH_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(spotifyId));
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let spotifyAccessToken: string;
  try {
    const body = await req.json() as { spotify_access_token?: string };
    if (!body.spotify_access_token) throw new Error('Missing spotify_access_token');
    spotifyAccessToken = body.spotify_access_token;
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // 1. Verify the Spotify access token and fetch profile
  const spotifyRes = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${spotifyAccessToken}` },
  });

  if (!spotifyRes.ok) {
    return Response.json({ error: 'Invalid Spotify token' }, { status: 401 });
  }

  const spotify = await spotifyRes.json() as {
    id: string;
    display_name?: string;
    email?: string;
    images?: { url: string }[];
    product?: string;
  };

  // if (spotify.product !== 'premium') {
  //   return Response.json(
  //     { error: 'Spotify Premium required', detail: 'mix requires a Spotify Premium account for playback.' },
  //     { status: 403 },
  //   );
  // }

  const spotifyId = spotify.id;
  // Use real email if Spotify provides one, otherwise a stable internal address.
  const email = spotify.email ?? `${spotifyId}@spotify.mix`;
  const displayName = spotify.display_name || 'DJ Anon';
  const avatarUrl = spotify.images?.[0]?.url ?? null;
  const password = await deriveStablePassword(spotifyId);

  // Admin client — can create users and bypass RLS
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Anon client — used for signInWithPassword to get a real session token
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 2. Create Supabase auth user if they don't already exist.
  //    Ignore "user already exists" errors — they'll sign in fine below.
  await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { spotify_id: spotifyId },
  });

  // 3. Sign in to get a real session (works whether user is new or existing)
  let { data: authData, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });

  // If sign-in fails for any auth reason (stale password, unconfirmed email, etc.),
  // look up the existing user and patch their account, then retry once.
  if (signInError && ['invalid_credentials', 'email_not_confirmed'].includes(signInError.code ?? '')) {
    console.log('Patching auth user — code:', signInError.code);
    const { data: usersData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = usersData?.users?.find((u) => u.email === email);
    if (existingUser) {
      await admin.auth.admin.updateUserById(existingUser.id, { password, email_confirm: true });
      ({ data: authData, error: signInError } = await anon.auth.signInWithPassword({ email, password }));
    }
  }

  if (signInError || !authData.session) {
    console.error('signInWithPassword failed:', signInError);
    return Response.json({
      error: 'Authentication failed',
      detail: signInError?.message ?? 'no session returned',
      code: signInError?.status,
    }, { status: 500 });
  }

  const supabaseUserId = authData.user.id;

  // 4. Insert public.users row — insert-only, never overwrites existing data.
  //    If the row already exists (conflict on id), do nothing.
  const { error: upsertError } = await admin.from('users').upsert(
    {
      id: supabaseUserId,
      display_name: displayName,
      avatar_url: avatarUrl,
      spotify_id: spotifyId,
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );

  if (upsertError) {
    console.error('public.users upsert failed:', upsertError);
    // Non-fatal — user can still use the app, profile row will be retried next login
  }

  // 5. Return the Supabase session to the mobile app
  return Response.json({
    access_token: authData.session.access_token,
    refresh_token: authData.session.refresh_token,
  });
});
