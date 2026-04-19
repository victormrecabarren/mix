import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useLeague } from '@/context/LeagueContext';
import { RoundScreen } from '@/screens/round/RoundScreen';
import { colors } from '@/theme/colors';

type ActiveRound = {
  roundId: string;
  seasonId: string;
};

type State =
  | { status: 'loading' }
  | { status: 'no_league' }
  | { status: 'no_season' }
  | { status: 'no_active_round' }
  | { status: 'ready'; round: ActiveRound };

async function resolveActiveRound(leagueId: string): Promise<{ round: ActiveRound | null; hasActiveSeason: boolean }> {
  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('league_id', leagueId)
    .eq('status', 'active')
    .single();

  if (!season) return { round: null, hasActiveSeason: false };

  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('season_id', season.id)
    .gt('voting_deadline_at', new Date().toISOString())
    .order('round_number', { ascending: true })
    .limit(1)
    .single();

  return {
    round: round ? { roundId: round.id, seasonId: season.id } : null,
    hasActiveSeason: true,
  };
}

export function MixTabScreen() {
  const { activeLeagueId, activeLeague } = useLeague();
  const [state, setState] = useState<State>({ status: 'loading' });

  const resolve = useCallback(async () => {
    if (!activeLeagueId) {
      setState({ status: 'no_league' });
      return;
    }

    setState({ status: 'loading' });
    const { round, hasActiveSeason } = await resolveActiveRound(activeLeagueId);

    if (round) {
      setState({ status: 'ready', round });
    } else if (hasActiveSeason) {
      setState({ status: 'no_active_round' });
    } else {
      setState({ status: 'no_season' });
    }
  }, [activeLeagueId]);

  // Re-resolve when the tab comes into focus (a round may have advanced since last visit)
  useFocusEffect(useCallback(() => { void resolve(); }, [resolve]));

  if (state.status === 'loading') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      </SafeAreaView>
    );
  }

  if (state.status === 'no_league') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.label}>No active league</Text>
          <Text style={styles.body}>Join or create a league from the Home tab.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (state.status === 'no_season') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centered}>
          {activeLeague && <Text style={styles.leagueName}>{activeLeague.name}</Text>}
          <Text style={styles.label}>No active season</Text>
          <Text style={styles.body}>The commissioner hasn't started a season yet.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (state.status === 'no_active_round') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centered}>
          {activeLeague && <Text style={styles.leagueName}>{activeLeague.name}</Text>}
          <Text style={styles.label}>Between rounds</Text>
          <Text style={styles.body}>All rounds have closed. Check Home for standings.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <RoundScreen roundId={state.round.roundId} seasonId={state.round.seasonId} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bgPrimary },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  leagueName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.brand,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  label: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  body: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
