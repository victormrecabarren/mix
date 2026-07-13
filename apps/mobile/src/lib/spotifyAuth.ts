import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { auditMusicCredentials, auditMusicCredentialWarning } from './musicCredentialAudit';

const SPOTIFY_CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID!;
const REDIRECT_URI = 'mix://auth/callback';

export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-library-read',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-modify-public',
  'playlist-modify-private',
].join(' ');

export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix ms
}

export interface SpotifyProfile {
  id: string;
  displayName: string;
  email?: string;
  imageUrl?: string;
  // 'premium' is required for Web Playback SDK streaming. Captured at login
  // and refreshable via refreshSpotifyProfile().
  product?: string;
  productCheckedAt?: number;
}

export class SpotifyRefreshRevokedError extends Error {
  constructor(
    public readonly errorDescription: string,
    public readonly errorCode: string,
  ) {
    super(errorDescription || 'Spotify refresh token revoked');
    this.name = 'SpotifyRefreshRevokedError';
  }
}

let hasAuditedSpotifyRevocation = false;

// ─── PKCE helpers ────────────────────────────────────────────────────────────

function base64URLEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generatePKCE() {
  const verifier = base64URLEncode(Crypto.getRandomBytes(32));
  const hashB64 = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  const challenge = hashB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return { verifier, challenge };
}

// ─── Main auth flow ───────────────────────────────────────────────────────────

export async function loginWithSpotify(): Promise<SpotifyProfile> {
  auditMusicCredentials("spotify.login.start", {
    provider: "spotify",
    appleMusicCredentialsUsed: false,
  });
  const { verifier, challenge } = await generatePKCE();
  await SecureStore.setItemAsync('spotify_pkce_verifier', verifier);

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SPOTIFY_SCOPES,
  });

  const authUrl = `https://accounts.spotify.com/authorize?${params}`;
  const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);

  if (result.type !== 'success') {
    throw new Error('Spotify login was cancelled or failed');
  }

  const callbackUrl = new URL(result.url);
  const code = callbackUrl.searchParams.get('code');
  if (!code) {
    const errDesc = callbackUrl.searchParams.get('error_description') ?? 'No code returned';
    throw new Error(errDesc);
  }

  const storedVerifier = await SecureStore.getItemAsync('spotify_pkce_verifier');
  if (!storedVerifier) throw new Error('PKCE verifier not found');

  // Exchange code for tokens directly with Spotify (no secret needed for PKCE)
  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: SPOTIFY_CLIENT_ID,
      code_verifier: storedVerifier,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.json() as { error_description?: string };
    throw new Error(err.error_description ?? 'Token exchange failed');
  }

  const tokenData = await tokenRes.json() as { access_token: string; refresh_token: string; expires_in: number };
  const tokens: SpotifyTokens = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
  };
  await saveSpotifyTokens(tokens);

  const profile = await fetchSpotifyProfile(tokens.accessToken);
  await SecureStore.setItemAsync('spotify_user', JSON.stringify(profile));
  auditMusicCredentials("spotify.login.profileStored", {
    provider: "spotify",
    spotifyUserId: profile.id,
    hasEmail: !!profile.email,
    product: profile.product ?? "unknown",
    appleMusicCredentialsUsed: false,
  });
  return profile;
}

// ─── Token storage ────────────────────────────────────────────────────────────

export async function saveSpotifyTokens(tokens: SpotifyTokens) {
  await SecureStore.setItemAsync('spotify_tokens', JSON.stringify(tokens));
  hasAuditedSpotifyRevocation = false;
  auditMusicCredentials("spotify.tokens.stored", {
    provider: "spotify",
    hasAccessToken: !!tokens.accessToken,
    hasRefreshToken: !!tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  });
}

export async function getSpotifyTokens(): Promise<SpotifyTokens | null> {
  const raw = await SecureStore.getItemAsync('spotify_tokens');
  return raw ? JSON.parse(raw) : null;
}

export async function refreshSpotifyTokens(refreshToken: string): Promise<SpotifyTokens> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: SPOTIFY_CLIENT_ID,
    }).toString(),
  });
  if (!res.ok) {
    const err = await res.json() as { error?: string; error_description?: string };
    const errorCode = err.error ?? '';
    const errorDescription = err.error_description ?? 'Token refresh failed';
    const isRevoked = errorCode === 'invalid_grant';

    if (isRevoked) {
      if (!hasAuditedSpotifyRevocation) {
        hasAuditedSpotifyRevocation = true;
        auditMusicCredentialWarning('spotify.session.revoked', {
          errorDescription,
          errorCode,
        });
        await clearSpotifySession();
      }
      throw new SpotifyRefreshRevokedError(errorDescription, errorCode);
    }

    throw new Error(errorDescription);
  }
  const data = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
  const tokens: SpotifyTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  await saveSpotifyTokens(tokens);
  return tokens;
}

// Returns a valid (non-expired) access token, refreshing if needed
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await getSpotifyTokens();
  if (!tokens) {
    auditMusicCredentials("spotify.token.requested", {
      provider: "spotify",
      result: "missing",
    });
    return null;
  }
  // Refresh if expiring within 2 minutes
  if (Date.now() > tokens.expiresAt - 120_000) {
    auditMusicCredentials("spotify.token.requested", {
      provider: "spotify",
      result: "refreshing",
    });
    try {
      const refreshed = await refreshSpotifyTokens(tokens.refreshToken);
      return refreshed.accessToken;
    } catch (error) {
      if (error instanceof SpotifyRefreshRevokedError) return null;
      throw error;
    }
  }
  auditMusicCredentials("spotify.token.requested", {
    provider: "spotify",
    result: "cached-valid",
  });
  return tokens.accessToken;
}

/** New access token from Spotify (Web Playback SDK often needs a freshly minted token even if the old one is not expired yet). */
export async function forceRefreshAccessToken(): Promise<string | null> {
  const tokens = await getSpotifyTokens();
  if (!tokens) {
    auditMusicCredentials("spotify.token.forceRefresh", {
      provider: "spotify",
      result: "missing",
    });
    return null;
  }
  auditMusicCredentials("spotify.token.forceRefresh", {
    provider: "spotify",
    result: "refreshing",
  });
  try {
    const refreshed = await refreshSpotifyTokens(tokens.refreshToken);
    return refreshed.accessToken;
  } catch (error) {
    if (error instanceof SpotifyRefreshRevokedError) return null;
    throw error;
  }
}

export async function getSpotifyProfile(): Promise<SpotifyProfile | null> {
  const raw = await SecureStore.getItemAsync('spotify_user');
  return raw ? JSON.parse(raw) : null;
}

export async function clearSpotifySession() {
  await SecureStore.deleteItemAsync('spotify_tokens');
  await SecureStore.deleteItemAsync('spotify_user');
  await SecureStore.deleteItemAsync('spotify_pkce_verifier');
  auditMusicCredentials("spotify.session.cleared", { provider: "spotify" });
}

// ─── Profile ─────────────────────────────────────────────────────────────────

async function fetchSpotifyProfile(accessToken: string): Promise<SpotifyProfile> {
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch Spotify profile');
  const data = await res.json() as {
    id: string;
    display_name?: string;
    email?: string;
    images?: { url: string }[];
    product?: string;
  };
  return {
    id: data.id,
    displayName: data.display_name ?? data.id,
    email: data.email,
    imageUrl: data.images?.[0]?.url,
    product: data.product,
    productCheckedAt: Date.now(),
  };
}

// Re-fetches /v1/me with the current token and updates the stored profile.
// Use this to check whether the account is still Premium without forcing the
// user to log out. Returns the updated profile, or null if no session.
export async function refreshSpotifyProfile(): Promise<SpotifyProfile | null> {
  const token = await getValidAccessToken();
  if (!token) return null;
  try {
    const profile = await fetchSpotifyProfile(token);
    await SecureStore.setItemAsync('spotify_user', JSON.stringify(profile));
    auditMusicCredentials("spotify.profile.refreshed", {
      provider: "spotify",
      spotifyUserId: profile.id,
      product: profile.product ?? "unknown",
      hasEmail: !!profile.email,
    });
    return profile;
  } catch (err) {
    auditMusicCredentialWarning("spotify.profile.refreshFailed", {
      provider: "spotify",
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// Cheap read of the last-known token expiry for diagnostics.
export async function getSpotifyTokenExpiry(): Promise<number | null> {
  const tokens = await getSpotifyTokens();
  return tokens?.expiresAt ?? null;
}
