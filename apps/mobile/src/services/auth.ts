import { supabase } from "@/lib/supabase";
import {
  loginWithSpotify,
  getValidAccessToken,
  clearSpotifySession,
  getSpotifyProfile,
} from "@/lib/spotifyAuth";
import { signInToSupabase } from "@/lib/supabaseAuth";
import { postgresToMixError, NotAuthenticatedError } from "./errors";

// Triggers the native Spotify OAuth flow, exchanges the token for a Supabase
// session, and returns the resolved Spotify profile. Throws a NotAuthenticated
// error if either step fails to produce a session.
export async function signInWithSpotify(): Promise<void> {
  await loginWithSpotify();
  const token = await getValidAccessToken();
  if (!token) throw new NotAuthenticatedError();
  await signInToSupabase(token);
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw postgresToMixError(error);
}

// Tears down both the Spotify session and the Supabase session. Safe to call
// even if one side was already cleared.
export async function signOut(): Promise<void> {
  await Promise.allSettled([clearSpotifySession(), supabase.auth.signOut()]);
}

export type CurrentUser = {
  id: string;
  email: string | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw postgresToMixError(error);
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

// Re-exported from spotifyAuth for convenience — services-layer consumers
// shouldn't need to reach into @/lib for platform helpers.
export { getSpotifyProfile };
