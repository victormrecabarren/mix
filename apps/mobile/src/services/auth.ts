import { supabase } from "@/lib/supabase";
import {
  loginWithSpotify,
  getValidAccessToken,
  clearSpotifySession,
  getSpotifyProfile,
} from "@/lib/spotifyAuth";
import { loginWithAppleMusic, clearAppleMusicSession } from "@/lib/appleMusicAuth";
import { signInToSupabase, signInToSupabaseWithAppleMusic } from "@/lib/supabaseAuth";
import { auditMusicCredentials } from "@/lib/musicCredentialAudit";
import { postgresToMixError, NotAuthenticatedError } from "./errors";

// Triggers the native Spotify OAuth flow, exchanges the token for a Supabase
// session, and returns the resolved Spotify profile. Throws a NotAuthenticated
// error if either step fails to produce a session.
export async function signInWithSpotify(): Promise<void> {
  auditMusicCredentials("auth.signInWithSpotify.start", {
    requestedProvider: "spotify",
    appleMusicCredentialsUsed: false,
  });
  await loginWithSpotify();
  const token = await getValidAccessToken();
  if (!token) throw new NotAuthenticatedError();
  await signInToSupabase(token);
  auditMusicCredentials("auth.signInWithSpotify.complete", {
    requestedProvider: "spotify",
    supabaseBridgeProvider: "spotify",
    appleMusicCredentialsUsed: false,
  });
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw postgresToMixError(error);
}

// Triggers the native "Sign in with Apple" sheet, exchanges the identity token
// for a Supabase session, and stores the Apple Music profile locally.
export async function signInWithAppleMusic(): Promise<void> {
  auditMusicCredentials("auth.signInWithAppleMusic.start", {
    requestedProvider: "applemusic",
    spotifyCredentialsUsed: false,
  });
  const profile = await loginWithAppleMusic();
  await signInToSupabaseWithAppleMusic(profile.identityToken, profile.displayName);
  auditMusicCredentials("auth.signInWithAppleMusic.complete", {
    requestedProvider: "applemusic",
    supabaseBridgeProvider: "applemusic",
    spotifyCredentialsUsed: false,
  });
}

// Tears down Spotify, Apple Music, and Supabase sessions. Safe to call even if
// one or more sides were already cleared.
export async function signOut(): Promise<void> {
  auditMusicCredentials("auth.signOut.clearAllProviders.start");
  await Promise.allSettled([
    clearSpotifySession(),
    clearAppleMusicSession(),
    supabase.auth.signOut(),
  ]);
  auditMusicCredentials("auth.signOut.clearAllProviders.complete");
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
