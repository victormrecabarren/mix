import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getSpotifyProfile, getValidAccessToken, clearSpotifySession } from '@/lib/spotifyAuth';
import { getAppleMusicProfile, clearAppleMusicSession } from '@/lib/appleMusicAuth';
import { signInToSupabase, hasSupabaseSession } from '@/lib/supabaseAuth';
import { supabase } from '@/lib/supabase';
import {
  auditMusicCredentials,
  auditMusicCredentialWarning,
} from '@/lib/musicCredentialAudit';

// Unified profile shape for all music services.
// `id` is the service-specific user ID (Spotify ID or Apple sub); not used for DB writes —
// use `supabaseUserId` for all Supabase operations.
export interface MusicUserProfile {
  musicService: 'spotify' | 'applemusic';
  id: string;
  displayName: string;
  email?: string;
  imageUrl?: string;
}

interface SessionContextValue {
  session: MusicUserProfile | null;
  supabaseUserId: string | null;
  loading: boolean;
  needsSpotifyReauth: boolean;
  requireSpotifyReauth: () => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  supabaseUserId: null,
  loading: true,
  needsSpotifyReauth: false,
  requireSpotifyReauth: () => {},
  signOut: async () => {},
  refresh: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<MusicUserProfile | null>(null);
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSpotifyReauth, setNeedsSpotifyReauth] = useState(false);
  const needsSpotifyReauthRef = useRef(false);
  const appState = useRef(AppState.currentState);

  const updateSpotifyReauth = useCallback((needed: boolean) => {
    needsSpotifyReauthRef.current = needed;
    setNeedsSpotifyReauth(needed);
  }, []);

  const requireSpotifyReauth = useCallback(() => {
    updateSpotifyReauth(true);
  }, [updateSpotifyReauth]);

  const refresh = useCallback(async () => {
    let p: MusicUserProfile | null = null;
    let selectedBy: 'spotify' | 'applemusic' | 'supabase-fallback' | null = null;
    let spotifyReauthRequired = false;

    // ── Spotify path ───────────────────────────────────────────────────────────
    const spotifyProfile = await getSpotifyProfile();
    const appleProfile = await getAppleMusicProfile();
    auditMusicCredentials('session.refresh.localProviderState', {
      hasSpotifyProfile: !!spotifyProfile,
      hasAppleMusicProfile: !!appleProfile,
    });
    if (spotifyProfile && appleProfile) {
      auditMusicCredentialWarning('session.refresh.multipleLocalProviderProfiles', {
        selectedProvider: 'spotify',
        reason: 'spotify profile takes precedence when both local profiles exist',
        hasSpotifyProfile: true,
        hasAppleMusicProfile: true,
      });
    }
    if (spotifyProfile) {
      const token = await getValidAccessToken();
      if (!token) {
        spotifyReauthRequired = true;
        updateSpotifyReauth(true);
      }

      // Crash recovery: if Spotify session exists but Supabase session was lost
      // (e.g. AsyncStorage cleared), re-run the auth bridge silently.
      if (token && !(await hasSupabaseSession())) {
        try {
          await signInToSupabase(token);
        } catch {
          // Non-fatal — app still works for playback, DB calls will fail gracefully
        }
      }
      if (token) {
        updateSpotifyReauth(false);
        p = {
          musicService: 'spotify',
          id: spotifyProfile.id,
          displayName: spotifyProfile.displayName,
          email: spotifyProfile.email,
          imageUrl: spotifyProfile.imageUrl,
        };
        selectedBy = 'spotify';
      }
    }

    // ── Apple Music path ───────────────────────────────────────────────────────
    if (!p && !spotifyReauthRequired) {
      if (appleProfile) {
        updateSpotifyReauth(false);
        p = {
          musicService: 'applemusic',
          id: appleProfile.id,
          displayName: appleProfile.displayName,
          email: appleProfile.email,
          imageUrl: undefined,
        };
        selectedBy = 'applemusic';
      }
    }

    // ── Fallback for email/password test players ───────────────────────────────
    // If neither music service has a local session but Supabase is still active,
    // build a minimal profile so the app recognises the user as signed in.
    if (!p && !spotifyReauthRequired && !needsSpotifyReauthRef.current) {
      const { data: sessionData } = await supabase.auth.getSession();
      const supabaseUser = sessionData.session?.user;
      if (supabaseUser) {
        const { data: userData } = await supabase
          .from('users')
          .select('display_name')
          .eq('id', supabaseUser.id)
          .single();
        p = {
          musicService: 'spotify',
          id: supabaseUser.id,
          displayName: userData?.display_name ?? supabaseUser.email ?? 'Test Player',
          email: supabaseUser.email,
        };
        selectedBy = 'supabase-fallback';
      }
    }

    setProfile(p);
    if (p) {
      const { data } = await supabase.auth.getSession();
      setSupabaseUserId(data.session?.user.id ?? null);
      auditMusicCredentials('session.refresh.selectedProvider', {
        selectedProvider: p.musicService,
        selectedBy,
        supabaseUserId: data.session?.user.id ?? null,
      });
    } else {
      setSupabaseUserId(null);
      auditMusicCredentials('session.refresh.selectedProvider', {
        selectedProvider: null,
        selectedBy: null,
      });
    }
    setLoading(false);
  }, [updateSpotifyReauth]);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        refresh();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [refresh]);

  const signOut = async () => {
    auditMusicCredentials('session.signOut.clearAllProviders.start');
    await Promise.allSettled([
      clearSpotifySession(),
      clearAppleMusicSession(),
      supabase.auth.signOut(),
    ]);
    setProfile(null);
    setSupabaseUserId(null);
    updateSpotifyReauth(false);
    auditMusicCredentials('session.signOut.clearAllProviders.complete');
  };

  return (
    <SessionContext.Provider
      value={{
        session: profile,
        supabaseUserId,
        loading,
        needsSpotifyReauth,
        requireSpotifyReauth,
        signOut,
        refresh,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
