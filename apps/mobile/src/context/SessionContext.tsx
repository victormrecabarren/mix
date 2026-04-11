import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getSpotifyProfile, clearSpotifySession, type SpotifyProfile } from '@/lib/spotifyAuth';

interface SessionContextValue {
  session: SpotifyProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  loading: true,
  signOut: async () => {},
  refresh: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<SpotifyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const appState = useRef(AppState.currentState);

  const refresh = useCallback(async () => {
    const p = await getSpotifyProfile();
    setProfile(p);
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
    setProfile(null);
  };

  return (
    <SessionContext.Provider value={{ session: profile, loading, signOut, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
