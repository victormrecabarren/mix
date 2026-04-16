import { supabase } from './supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/auth-spotify`;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Exchanges a Spotify access token for a Supabase session.
 *
 * Calls the auth-spotify Edge Function which:
 *   1. Verifies the Spotify token
 *   2. Creates or retrieves the Supabase auth user
 *   3. Insert-only upserts the public.users row
 *   4. Returns a Supabase session
 *
 * Then signs the Supabase client in with that session so auth.uid()
 * is set and RLS policies work for all subsequent queries.
 */
export async function signInToSupabase(spotifyAccessToken: string): Promise<void> {
  const res = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ spotify_access_token: spotifyAccessToken }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; detail?: string };
    const message = body.detail ?? body.error ?? `Auth failed (${res.status})`;
    throw new Error(message);
  }

  const { access_token, refresh_token } = await res.json() as {
    access_token: string;
    refresh_token: string;
  };

  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw new Error(`Failed to set Supabase session: ${error.message}`);
}

/**
 * Returns true if there is an active Supabase session.
 * Used by SessionContext to detect if crash recovery is needed.
 */
export async function hasSupabaseSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return data.session !== null;
}
