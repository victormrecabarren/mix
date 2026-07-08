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
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  supabaseUserId: null,
  loading: true,
  signOut: async () => {},
  refresh: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<MusicUserProfile | null>(null);
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const appState = useRef(AppState.currentState);

  const refresh = useCallback(async () => {
    let p: MusicUserProfile | null = null;
    let selectedBy: 'spotify' | 'applemusic' | 'supabase-fallback' | null = null;

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
      // Crash recovery: if Spotify session exists but Supabase session was lost
      // (e.g. AsyncStorage cleared), re-run the auth bridge silently.
      if (!(await hasSupabaseSession())) {
        const token = await getValidAccessToken();
        if (token) {
          try {
            await signInToSupabase(token);
          } catch {
            // Non-fatal — app still works for playback, DB calls will fail gracefully
          }
        }
      }
      p = {
        musicService: 'spotify',
        id: spotifyProfile.id,
        displayName: spotifyProfile.displayName,
        email: spotifyProfile.email,
        imageUrl: spotifyProfile.imageUrl,
      };
      selectedBy = 'spotify';
    }

    // ── Apple Music path ───────────────────────────────────────────────────────
    if (!p) {
      if (appleProfile) {
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
    if (!p) {
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
  }, []);

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
    auditMusicCredentials('session.signOut.clearAllProviders.complete');
  };

  return (
    <SessionContext.Provider value={{ session: profile, supabaseUserId, loading, signOut, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
