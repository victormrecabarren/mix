import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/context/SessionContext';

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

  // When the user signs in, auto-select their first league.
  // When they sign out, clear the active league.
  useEffect(() => {
    if (!supabaseUserId) {
      setActiveLeagueIdState(null);
      setActiveLeague(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    supabase
      .from('league_members')
      .select('league_id')
      .eq('user_id', supabaseUserId)
      .order('joined_at', { ascending: true })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.league_id) {
          setActiveLeagueIdState(data.league_id);
          void resolveActiveLeague(data.league_id);
        }
        setLoading(false);
      });
  }, [supabaseUserId, resolveActiveLeague]);

  const setActiveLeagueId = useCallback((id: string) => {
    setActiveLeagueIdState(id);
    void resolveActiveLeague(id);
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
