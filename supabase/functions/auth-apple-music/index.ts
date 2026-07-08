import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('ANON_KEY_JWT')!;
const USER_AUTH_SECRET = Deno.env.get('USER_AUTH_SECRET')!;

// Same derive-stable-password pattern as auth-spotify.
// Apple user IDs are stable per-app so this produces a consistent password.
async function deriveStablePassword(appleId: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(USER_AUTH_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`apple:${appleId}`));
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function decodeBase64Url(segment: string): unknown {
  const padded = segment
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(segment.length + (4 - (segment.length % 4)) % 4, '=');
  return JSON.parse(atob(padded));
}

// Verifies an Apple identity token (JWT signed by Apple via RS256).
// Fetches Apple's public JWKS to validate the signature.
async function verifyAppleIdentityToken(identityToken: string): Promise<{
  sub: string;
  email?: string;
}> {
  const parts = identityToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed identity token');
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = decodeBase64Url(headerB64) as { kid: string; alg: string };
  const payload = decodeBase64Url(payloadB64) as {
    iss: string;
    sub: string;
    aud: string | string[];
    exp: number;
    email?: string;
    email_verified?: boolean | string;
  };

  if (payload.iss !== 'https://appleid.apple.com') throw new Error('Invalid token issuer');
  if (Math.floor(Date.now() / 1000) > payload.exp) throw new Error('Identity token expired');

  const keysRes = await fetch('https://appleid.apple.com/auth/keys');
  if (!keysRes.ok) throw new Error('Failed to fetch Apple public keys');
  const { keys } = await keysRes.json() as { keys: Array<{ kid: string } & JsonWebKey> };

  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error(`No Apple key found for kid=${header.kid}`);

  const publicKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const message = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sigPadded = signatureB64
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(signatureB64.length + (4 - (signatureB64.length % 4)) % 4, '=');
  const signature = Uint8Array.from(atob(sigPadded), (c) => c.charCodeAt(0));

  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signature, message);
  if (!valid) throw new Error('Invalid token signature');

  return { sub: payload.sub, email: payload.email };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let identityToken: string;
  let displayName: string;
  try {
    const body = await req.json() as { identity_token?: string; display_name?: string };
    if (!body.identity_token) throw new Error('Missing identity_token');
    identityToken = body.identity_token;
    displayName = body.display_name?.trim() || 'DJ Anon';
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // 1. Verify the Apple identity token and extract stable sub
  let applePayload: { sub: string; email?: string };
  try {
    applePayload = await verifyAppleIdentityToken(identityToken);
  } catch (e) {
    return Response.json(
      { error: 'Invalid Apple identity token', detail: (e as Error).message },
      { status: 401 },
    );
  }

  const appleId = applePayload.sub;
  // Apple only returns email on first sign-in — stable address used as fallback.
  const email = applePayload.email ?? `${appleId}@apple.mix`;
  const password = await deriveStablePassword(appleId);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 2. Create Supabase auth user (idempotent — ignore "already exists")
  await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { apple_id: appleId },
  });

  // 3. Sign in to get a real session
  let { data: authData, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });

  // Patch stale account then retry (same recovery pattern as auth-spotify)
  if (signInError && ['invalid_credentials', 'email_not_confirmed'].includes(signInError.code ?? '')) {
    console.log('Patching Apple auth user — code:', signInError.code);
    const { data: usersData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = usersData?.users?.find((u) => u.email === email);
    if (existingUser) {
      await admin.auth.admin.updateUserById(existingUser.id, { password, email_confirm: true });
      ({ data: authData, error: signInError } = await anon.auth.signInWithPassword({
        email,
        password,
      }));
    }
  }

  if (signInError || !authData.session) {
    console.error('signInWithPassword failed:', signInError);
    return Response.json({
      error: 'Authentication failed',
      detail: signInError?.message ?? 'no session returned',
    }, { status: 500 });
  }

  const supabaseUserId = authData.user.id;

  // 4. Insert public.users row — insert-only, never overwrites existing data.
  const { error: upsertError } = await admin.from('users').upsert(
    {
      id: supabaseUserId,
      display_name: displayName,
      apple_music_id: appleId,
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (upsertError) console.error('public.users upsert failed:', upsertError);

  // 5. Return the Supabase session to the mobile app
  return Response.json({
    access_token: authData.session.access_token,
    refresh_token: authData.session.refresh_token,
  });
});
