import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getSpotifyProfile, getValidAccessToken, clearSpotifySession, type SpotifyProfile } from '@/lib/spotifyAuth';
import { signInToSupabase, hasSupabaseSession } from '@/lib/supabaseAuth';
import { supabase } from '@/lib/supabase';

interface SessionContextValue {
  session: SpotifyProfile | null;
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
  const [profile, setProfile] = useState<SpotifyProfile | null>(null);
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const appState = useRef(AppState.currentState);

  const refresh = useCallback(async () => {
    const p = await getSpotifyProfile();
    // Crash recovery: if Spotify session exists but Supabase session was lost
    // (e.g. AsyncStorage cleared), re-run the auth bridge silently.
    if (p && !(await hasSupabaseSession())) {
      const token = await getValidAccessToken();
      if (token) {
        try {
          await signInToSupabase(token);
        } catch {
          // Non-fatal — app still works for playback, DB calls will fail gracefully
        }
      }
    }
    setProfile(p);
    if (p) {
      const { data } = await supabase.auth.getSession();
      setSupabaseUserId(data.session?.user.id ?? null);
    } else {
      setSupabaseUserId(null);
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
    await clearSpotifySession();
    await supabase.auth.signOut();
    setProfile(null);
    setSupabaseUserId(null);
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
