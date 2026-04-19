import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useLeague } from '@/context/LeagueContext';
import { LeagueScreen } from '@/screens/league/LeagueScreen';

export function HomeTabScreen() {
  const { activeLeagueId, loading } = useLeague();
  const router = useRouter();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#555" />
      </View>
    );
  }

  if (!activeLeagueId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No league yet</Text>
        <Text style={styles.emptyBody}>Create a new league or join one with an invite link.</Text>
        <TouchableOpacity
          style={styles.createBtn}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => router.push('/(tabs)/(home)/create-league' as any)}
        >
          <Text style={styles.createBtnText}>Create a League</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <LeagueScreen leagueId={activeLeagueId} />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  emptyBody: { fontSize: 14, color: '#555', textAlign: 'center', lineHeight: 20 },
  createBtn: {
    marginTop: 8,
    backgroundColor: '#1DB954',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  createBtnText: { fontSize: 15, fontWeight: '700', color: '#000' },
});
