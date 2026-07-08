import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/context/SessionContext';

const STORAGE_KEY = 'activeLeagueId';

type League = {
  id: string;
  name: string;
};

type LeagueContextValue = {
  activeLeagueId: string | null;
  activeLeague: League | null;
  setActiveLeagueId: (id: string) => void;
  loading: boolean;
};

const LeagueContext = createContext<LeagueContextValue | null>(null);

export function LeagueProvider({ children }: { children: React.ReactNode }) {
  const { supabaseUserId } = useSession();
  const [activeLeagueId, setActiveLeagueIdState] = useState<string | null>(null);
  const [activeLeague, setActiveLeague] = useState<League | null>(null);
  const [loading, setLoading] = useState(true);

  const resolveActiveLeague = useCallback(async (leagueId: string) => {
    const { data } = await supabase
      .from('leagues')
      .select('id, name')
      .eq('id', leagueId)
      .single();
    setActiveLeague(data ?? null);
  }, []);

  // On sign-in: restore the last selected league from storage, then verify the
  // user is still a member. Falls back to their oldest-joined league if the
  // stored ID is missing or they're no longer a member (e.g. removed, new device).
  // On sign-out: clear state and storage.
  useEffect(() => {
    if (!supabaseUserId) {
      setActiveLeagueIdState(null);
      setActiveLeague(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const resolve = async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);

      if (stored) {
        const { data } = await supabase
          .from('league_members')
          .select('league_id')
          .eq('user_id', supabaseUserId)
          .eq('league_id', stored)
          .maybeSingle();

        if (data?.league_id) {
          setActiveLeagueIdState(data.league_id);
          await resolveActiveLeague(data.league_id);
          setLoading(false);
          return;
        }
      }

      // No valid stored league — fall back to oldest joined
      const { data } = await supabase
        .from('league_members')
        .select('league_id')
        .eq('user_id', supabaseUserId)
        .order('joined_at', { ascending: true })
        .limit(1)
        .single();

      if (data?.league_id) {
        setActiveLeagueIdState(data.league_id);
        await resolveActiveLeague(data.league_id);
        void AsyncStorage.setItem(STORAGE_KEY, data.league_id);
      }
      setLoading(false);
    };

    void resolve();
  }, [supabaseUserId, resolveActiveLeague]);

  const setActiveLeagueId = useCallback((id: string) => {
    setActiveLeagueIdState(id);
    void resolveActiveLeague(id);
    void AsyncStorage.setItem(STORAGE_KEY, id);
  }, [resolveActiveLeague]);

  return (
    <LeagueContext.Provider value={{ activeLeagueId, activeLeague, setActiveLeagueId, loading }}>
      {children}
    </LeagueContext.Provider>
  );
}

export function useLeague(): LeagueContextValue {
  const ctx = useContext(LeagueContext);
  if (!ctx) throw new Error('useLeague must be used within LeagueProvider');
  return ctx;
}
