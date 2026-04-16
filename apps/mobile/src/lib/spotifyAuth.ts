import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

const REDIRECT_URI = 'mix://auth/callback';
const CLIENT_ID_KEY = 'spotify_client_id';

// ─── Client ID management ─────────────────────────────────────────────────────

export async function getClientId(): Promise<string | null> {
  return SecureStore.getItemAsync(CLIENT_ID_KEY);
}

export async function saveClientId(clientId: string): Promise<void> {
  await SecureStore.setItemAsync(CLIENT_ID_KEY, clientId.trim());
}

export async function clearClientId(): Promise<void> {
  await SecureStore.deleteItemAsync(CLIENT_ID_KEY);
}

async function requireClientId(): Promise<string> {
  const id = await SecureStore.getItemAsync(CLIENT_ID_KEY);
  if (!id) throw new Error('No Spotify client ID configured');
  return id;
}

// ─── Scopes ───────────────────────────────────────────────────────────────────

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
}

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
  const clientId = await requireClientId();
  const { verifier, challenge } = await generatePKCE();
  await SecureStore.setItemAsync('spotify_pkce_verifier', verifier);

  const params = new URLSearchParams({
    client_id: clientId,
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
      client_id: clientId,
      code_verifier: storedVerifier,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.json() as { error?: string; error_description?: string };
    throw new Error(`Token exchange failed (${tokenRes.status}): ${err.error_description ?? err.error ?? 'unknown'}`);
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
  return profile;
}

// ─── Token storage ────────────────────────────────────────────────────────────

export async function saveSpotifyTokens(tokens: SpotifyTokens) {
  await SecureStore.setItemAsync('spotify_tokens', JSON.stringify(tokens));
}

export async function getSpotifyTokens(): Promise<SpotifyTokens | null> {
  const raw = await SecureStore.getItemAsync('spotify_tokens');
  return raw ? JSON.parse(raw) : null;
}

export async function refreshSpotifyTokens(refreshToken: string): Promise<SpotifyTokens> {
  const clientId = await requireClientId();
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }).toString(),
  });
  if (!res.ok) {
    const err = await res.json() as { error_description?: string };
    throw new Error(err.error_description ?? 'Token refresh failed');
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
  if (!tokens) return null;
  // Refresh if expiring within 2 minutes
  if (Date.now() > tokens.expiresAt - 120_000) {
    const refreshed = await refreshSpotifyTokens(tokens.refreshToken);
    return refreshed.accessToken;
  }
  return tokens.accessToken;
}

/** New access token from Spotify (Web Playback SDK often needs a freshly minted token even if the old one is not expired yet). */
export async function forceRefreshAccessToken(): Promise<string | null> {
  const tokens = await getSpotifyTokens();
  if (!tokens) return null;
  const refreshed = await refreshSpotifyTokens(tokens.refreshToken);
  return refreshed.accessToken;
}

export async function getSpotifyProfile(): Promise<SpotifyProfile | null> {
  const raw = await SecureStore.getItemAsync('spotify_user');
  return raw ? JSON.parse(raw) : null;
}

export async function clearSpotifySession() {
  await SecureStore.deleteItemAsync('spotify_tokens');
  await SecureStore.deleteItemAsync('spotify_user');
  await SecureStore.deleteItemAsync('spotify_pkce_verifier');
}

// ─── Profile ─────────────────────────────────────────────────────────────────

async function fetchSpotifyProfile(accessToken: string): Promise<SpotifyProfile> {
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[spotifyAuth] /me failed', res.status, text);
    let message = 'unknown';
    try { message = (JSON.parse(text) as { error?: { message?: string } })?.error?.message ?? text; } catch { message = text; }
    throw new Error(`Spotify /me failed (${res.status}): ${message}`);
  }
  const data = await res.json() as { id: string; display_name?: string; email?: string; images?: { url: string }[] };
  return {
    id: data.id,
    displayName: data.display_name ?? data.id,
    email: data.email,
    imageUrl: data.images?.[0]?.url,
  };
}
