import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useLeague } from '@/context/LeagueContext';
import { LeagueScreen } from '@/screens/league/LeagueScreen';
import { nocturne } from '@/theme/colors';
import { fonts } from '@/theme/fonts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function HomeTabScreen() {
  const { activeLeagueId, loading } = useLeague();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={nocturne.blue} />
      </View>
    );
  }

  if (!activeLeagueId) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.emptyTitle}>No league yet</Text>
        <Text style={styles.emptyBody}>
          Create a new league or join one with an invite link.
        </Text>
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
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 24,
    fontFamily: fonts.serif,
    color: nocturne.ink,
  },
  emptyBody: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: nocturne.inkMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  createBtn: {
    marginTop: 8,
    backgroundColor: nocturne.blue,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  createBtnText: {
    fontSize: 15,
    fontFamily: fonts.sansSemiBold,
    color: '#fff',
  },
});
