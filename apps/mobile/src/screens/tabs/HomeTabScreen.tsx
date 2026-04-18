import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSession } from '@/context/SessionContext';
import { supabase } from '@/lib/supabase';

type League = {
  id: string;
  name: string;
  admin_user_id: string;
};

export function HomeTabScreen() {
  const { session, supabaseUserId } = useSession();
  const router = useRouter();

  const [leagues, setLeagues] = useState<League[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(true);

  const fetchLeagues = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('league_members')
      .select('league:leagues(id, name, admin_user_id)')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch leagues:', error);
      return;
    }

    const flat = (data ?? [])
      .map((row) => row.league)
      .filter((l): l is League => l !== null);

    setLeagues(flat);
    setLoadingLeagues(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchLeagues(); }, [fetchLeagues]));

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLeagues();
    setRefreshing(false);
  }, [fetchLeagues]);

  return (
    <ScrollView
      contentContainerStyle={styles.root}
      style={{ backgroundColor: '#000' }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1DB954" />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.heading}>Home</Text>
          {session && <Text style={styles.subheading}>Hey, {session.displayName}</Text>}
        </View>
      </View>

      {/* Leagues section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Leagues</Text>
          <TouchableOpacity
            style={styles.newBtn}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onPress={() => router.push('/(tabs)/(stack)/create-league' as any)}
          >
            <Text style={styles.newBtnText}>+ New</Text>
          </TouchableOpacity>
        </View>

        {loadingLeagues ? (
          <ActivityIndicator color="#555" style={{ marginTop: 24 }} />
        ) : leagues.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No leagues yet.</Text>
            <TouchableOpacity
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onPress={() => router.push('/(tabs)/(stack)/create-league' as any)}
            >
              <Text style={styles.emptyLink}>Create your first league →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          leagues.map((league) => (
            <TouchableOpacity
              key={league.id}
              style={styles.leagueCard}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onPress={() => router.push({ pathname: '/(tabs)/(stack)/league/[id]' as any, params: { id: league.id } })}
              activeOpacity={0.7}
            >
              <Text style={styles.leagueName}>{league.name}</Text>
              {league.admin_user_id === supabaseUserId && (
                <Text style={styles.commissionerBadge}>COMMISSIONER</Text>
              )}
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#000',
    padding: 24,
    paddingTop: 56,
    paddingBottom: 48,
    gap: 24,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heading: { fontSize: 28, fontWeight: '800', color: '#fff' },
  subheading: { fontSize: 14, color: '#666', marginTop: 2 },

  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#666', letterSpacing: 1, textTransform: 'uppercase' },
  newBtn: { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#1DB954', borderRadius: 6 },
  newBtnText: { fontSize: 13, fontWeight: '700', color: '#000' },

  empty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 14, color: '#444' },
  emptyLink: { fontSize: 14, color: '#1DB954' },

  leagueCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leagueName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  commissionerBadge: { fontSize: 10, fontWeight: '800', color: '#1DB954', letterSpacing: 1 },
});
