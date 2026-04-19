import { useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useLeague } from '@/context/LeagueContext';
import { useActiveRoundForLeague } from '@/queries/useActiveRoundForLeague';
import { RoundScreen } from '@/screens/round/RoundScreen';

export function MixTabScreen() {
  const { activeLeagueId, activeLeague } = useLeague();
  const { data, isPending, refetch } = useActiveRoundForLeague(
    activeLeagueId ?? undefined,
  );

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  if (!activeLeagueId) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.label}>No active league</Text>
          <Text style={styles.body}>Join or create a league from the Home tab.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isPending || !data) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator color="#555" />
        </View>
      </SafeAreaView>
    );
  }

  if (!data.hasActiveSeason) {
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

  if (!data.round) {
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
      <RoundScreen roundId={data.round.roundId} seasonId={data.round.seasonId} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000' },
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
    color: '#1DB954',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  label: { fontSize: 18, fontWeight: '700', color: '#fff' },
  body: { fontSize: 14, color: '#555', textAlign: 'center', lineHeight: 20 },
});
