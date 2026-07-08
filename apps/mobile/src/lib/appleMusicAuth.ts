import * as AppleAuthentication from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';
import { auditMusicCredentials } from './musicCredentialAudit';

export interface AppleMusicProfile {
  id: string;          // Stable Apple user ID (sub claim) — unique per app per user
  displayName: string;
  email?: string;
  identityToken: string; // Short-lived JWT returned by Sign in with Apple — refreshed on each login
}

// Triggers the native "Sign in with Apple" sheet and stores the resulting profile.
// displayName and email are only returned on the first sign-in; subsequent calls
// return null for those fields. The stored profile is updated incrementally so
// existing values aren't clobbered.
export async function loginWithAppleMusic(): Promise<AppleMusicProfile> {
  auditMusicCredentials("appleMusic.login.start", {
    provider: "applemusic",
    spotifyCredentialsUsed: false,
  });
  const cred = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!cred.identityToken) throw new Error('Sign in with Apple did not return an identity token');

  const existing = await getAppleMusicProfile();
  const firstName = cred.fullName?.givenName;
  const lastName = cred.fullName?.familyName;
  const displayName =
    [firstName, lastName].filter(Boolean).join(' ') ||
    existing?.displayName ||
    'DJ Anon';

  const profile: AppleMusicProfile = {
    id: cred.user,
    displayName,
    email: cred.email ?? existing?.email ?? undefined,
    identityToken: cred.identityToken,
  };

  await SecureStore.setItemAsync('apple_music_profile', JSON.stringify(profile));
  auditMusicCredentials("appleMusic.login.profileStored", {
    provider: "applemusic",
    appleMusicUserId: profile.id,
    hasEmail: !!profile.email,
    hasIdentityToken: !!profile.identityToken,
    spotifyCredentialsUsed: false,
  });
  return profile;
}

export async function getAppleMusicProfile(): Promise<AppleMusicProfile | null> {
  const raw = await SecureStore.getItemAsync('apple_music_profile');
  return raw ? (JSON.parse(raw) as AppleMusicProfile) : null;
}

export async function clearAppleMusicSession(): Promise<void> {
  await SecureStore.deleteItemAsync('apple_music_profile');
  auditMusicCredentials("appleMusic.session.cleared", { provider: "applemusic" });
}
