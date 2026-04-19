import { useCallback, useState } from 'react';
import {
  RefreshControl, ScrollView, View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Share, Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/context/SessionContext';
import { useLeague } from '@/queries/useLeague';
import { useLeagueMembers } from '@/queries/useLeagueMembers';
import { useSeasonsForLeague } from '@/queries/useSeasonsForLeague';

export function LeagueScreen({ leagueId }: { leagueId: string }) {
  const router = useRouter();
  const { supabaseUserId } = useSession();

  const { data: league, isLoading: leagueLoading, refetch: refetchLeague } =
    useLeague(leagueId);
  const { data: seasons = [], refetch: refetchSeasons } =
    useSeasonsForLeague(leagueId);
  const { data: members = [], refetch: refetchMembers } =
    useLeagueMembers(leagueId);

  useFocusEffect(
    useCallback(() => {
      refetchLeague();
      refetchSeasons();
      refetchMembers();
    }, [refetchLeague, refetchSeasons, refetchMembers]),
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchLeague(), refetchSeasons(), refetchMembers()]);
    setRefreshing(false);
  }, [refetchLeague, refetchSeasons, refetchMembers]);

  const isCommissioner = league?.admin_user_id === supabaseUserId;

  const handleNewSeason = async () => {
    // FE guard: check if any season still has live rounds. Leaving this inline
    // until the creation-flow slice; it's a one-off that doesn't reuse well.
    const { data: liveRounds } = await supabase
      .from('rounds')
      .select('id, seasons!inner(league_id)')
      .gt('voting_deadline_at', new Date().toISOString())
      .eq('seasons.league_id', leagueId);

    if (liveRounds && liveRounds.length > 0) {
      Alert.alert(
        'Season in progress',
        'You can only have one active season at a time. Wait for the current season to finish before creating a new one.',
      );
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.push('/(tabs)/(home)/create-season' as any);
  };

  if (leagueLoading) {
    return <View style={styles.centered}><ActivityIndicator color="#555" /></View>;
  }

  if (!league) {
    return <View style={styles.centered}><Text style={styles.mutedText}>League not found.</Text></View>;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.root}
      style={{ flex: 1, backgroundColor: '#000' }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1DB954" />}
    >
      <View style={styles.leagueHeader}>
        <Text style={styles.leagueName}>{league.name}</Text>
        {isCommissioner && <Text style={styles.commissionerBadge}>COMMISSIONER</Text>}
      </View>

      {/* ── Seasons ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Seasons</Text>
          {isCommissioner && (
            <TouchableOpacity style={styles.newBtn} onPress={handleNewSeason}>
              <Text style={styles.newBtnText}>+ New</Text>
            </TouchableOpacity>
          )}
        </View>

        {seasons.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No seasons yet.</Text>
            {isCommissioner && (
              <TouchableOpacity onPress={handleNewSeason}>
                <Text style={styles.emptyLink}>Create the first season →</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          seasons.map((season) => (
            <TouchableOpacity
              key={season.id}
              style={styles.seasonCard}
              activeOpacity={0.7}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onPress={() => router.push({ pathname: '/(tabs)/(home)/season/[id]' as any, params: { id: season.id } })}
            >
              <View style={styles.seasonCardTop}>
                <View>
                  <Text style={styles.seasonName}>{season.name}</Text>
                  <Text style={styles.seasonMeta}>Season {season.season_number}</Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  season.status === 'active' ? styles.statusActive
                  : season.status === 'completed' ? styles.statusCompleted
                  : styles.statusDone,
                ]}>
                  <Text style={[
                    styles.statusText,
                    season.status === 'completed' && styles.statusTextCompleted,
                  ]}>{season.status.toUpperCase()}</Text>
                </View>
              </View>
              {isCommissioner && season.status === 'active' && season.invite_token && (
                <TouchableOpacity
                  style={styles.shareBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    Share.share({ message: `Join ${league.name} on mix!\nmix://join?token=${season.invite_token}` });
                  }}
                >
                  <Text style={styles.shareBtnText}>Share Invite Link</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* ── Members ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Members ({members.length})</Text>
        {members.map((m) => (
          <View key={m.user_id} style={styles.memberRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{m.display_name[0]?.toUpperCase() ?? '?'}</Text>
            </View>
            <Text style={styles.memberName}>{m.display_name}</Text>
            <View style={styles.memberBadges}>
              {m.user_id === league.admin_user_id && (
                <Text style={styles.commBadge}>COMM</Text>
              )}
              <Text style={[styles.roleBadge, m.role === 'spectator' && styles.roleBadgeSpectator]}>
                {m.role.toUpperCase()}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  mutedText: { color: '#555', fontSize: 15 },

  root: { backgroundColor: '#000', padding: 24, paddingTop: 56, paddingBottom: 48, gap: 32 },

  leagueHeader: { gap: 4 },
  leagueName: { fontSize: 28, fontWeight: '800', color: '#fff' },
  commissionerBadge: { fontSize: 10, fontWeight: '800', color: '#1DB954', letterSpacing: 1 },

  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#666', letterSpacing: 1, textTransform: 'uppercase' },
  newBtn: { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#1DB954', borderRadius: 6 },
  newBtnText: { fontSize: 13, fontWeight: '700', color: '#000' },

  empty: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 14, color: '#444' },
  emptyLink: { fontSize: 14, color: '#1DB954' },

  seasonCard: { backgroundColor: '#111', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#222', gap: 12 },
  seasonCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  seasonName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  seasonMeta: { fontSize: 12, color: '#555', marginTop: 2 },
  shareBtn: { paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  shareBtnText: { fontSize: 13, color: '#888', fontWeight: '600' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusActive: { backgroundColor: '#1DB95422' },
  statusDone: { backgroundColor: '#33333388' },
  statusCompleted: { backgroundColor: '#FFD70022' },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: '#1DB954' },
  statusTextCompleted: { color: '#FFD700' },

  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  memberName: { flex: 1, fontSize: 15, color: '#fff', fontWeight: '500' },
  memberBadges: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  commBadge: { fontSize: 9, fontWeight: '800', color: '#1DB954', letterSpacing: 1 },
  roleBadge: { fontSize: 9, fontWeight: '700', color: '#555', letterSpacing: 1 },
  roleBadgeSpectator: { color: '#444' },
});
