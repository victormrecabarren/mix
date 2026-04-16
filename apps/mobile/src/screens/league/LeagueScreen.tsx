import { useCallback, useEffect, useState } from 'react';
import {
  ScrollView, View, Text, StyleSheet, TouchableOpacity,
  Modal, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

type League = { id: string; name: string; admin_user_id: string };

type Season = {
  id: string;
  name: string;
  season_number: number;
  status: string;
  invite_token: string;
};

type Member = {
  user_id: string;
  role: string;
  display_name: string;
};

export function LeagueScreen({ leagueId }: { leagueId: string }) {
  const router = useRouter();

  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [league, setLeague] = useState<League | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalVisible, setModalVisible] = useState(false);
  const [seasonName, setSeasonName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    const [{ data: { user } }, { data: leagueData }, { data: seasonsData }, { data: membersData }] =
      await Promise.all([
        supabase.auth.getUser(),
        supabase.from('leagues').select('id, name, admin_user_id').eq('id', leagueId).single(),
        supabase
          .from('seasons')
          .select('id, name, season_number, status, invite_token')
          .eq('league_id', leagueId)
          .order('season_number', { ascending: true }),
        supabase
          .from('league_members')
          .select('user_id, role, users(display_name)')
          .eq('league_id', leagueId)
          .order('joined_at', { ascending: true }),
      ]);

    setSupabaseUserId(user?.id ?? null);
    setLeague(leagueData ?? null);
    setSeasons(seasonsData ?? []);
    setMembers(
      (membersData ?? []).map((m) => ({
        user_id: m.user_id,
        role: m.role,
        display_name:
          (Array.isArray(m.users) ? m.users[0]?.display_name : (m.users as { display_name: string } | null)?.display_name) ?? 'Unknown',
      })),
    );
    setLoading(false);
  }, [leagueId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isCommissioner = league?.admin_user_id === supabaseUserId;

  const handleCreateSeason = async () => {
    const name = seasonName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const { count } = await supabase
        .from('seasons')
        .select('*', { count: 'exact', head: true })
        .eq('league_id', leagueId);

      const { error } = await supabase.from('seasons').insert({
        league_id: leagueId,
        name,
        season_number: (count ?? 0) + 1,
      });

      if (error) throw new Error(error.message);
      setSeasonName('');
      setModalVisible(false);
      await fetchData();
    } catch (err) {
      console.error('Create season error:', err);
      Alert.alert('Failed to create season', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color="#555" /></View>;
  }

  if (!league) {
    return <View style={styles.centered}><Text style={styles.mutedText}>League not found.</Text></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.root} style={{ backgroundColor: '#000' }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        {isCommissioner && <Text style={styles.commissionerBadge}>COMMISSIONER</Text>}
      </View>

      <Text style={styles.pageTitle}>{league.name}</Text>

      {/* ── Seasons ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Seasons</Text>
          {isCommissioner && (
            <TouchableOpacity style={styles.newBtn} onPress={() => setModalVisible(true)}>
              <Text style={styles.newBtnText}>+ New</Text>
            </TouchableOpacity>
          )}
        </View>

        {seasons.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No seasons yet.</Text>
            {isCommissioner && (
              <TouchableOpacity onPress={() => setModalVisible(true)}>
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
              onPress={() => router.push({ pathname: '/season/[id]' as any, params: { id: season.id } })}
            >
              <View style={styles.seasonCardTop}>
                <View>
                  <Text style={styles.seasonName}>{season.name}</Text>
                  <Text style={styles.seasonMeta}>Season {season.season_number}</Text>
                </View>
                <View style={[styles.statusBadge, season.status === 'active' ? styles.statusActive : styles.statusDone]}>
                  <Text style={styles.statusText}>{season.status.toUpperCase()}</Text>
                </View>
              </View>
              {isCommissioner && (
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

      {/* Create Season Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>New Season</Text>
            <TextInput
              style={styles.input}
              placeholder="Season name (e.g. Spring 2026)"
              placeholderTextColor="#555"
              value={seasonName}
              onChangeText={setSeasonName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreateSeason}
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setModalVisible(false); setSeasonName(''); }}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createBtn, (!seasonName.trim() || creating) && styles.btnDisabled]}
                onPress={handleCreateSeason}
                disabled={!seasonName.trim() || creating}
              >
                {creating ? <ActivityIndicator color="#000" /> : <Text style={styles.createBtnText}>Create</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  mutedText: { color: '#555', fontSize: 15 },

  root: { backgroundColor: '#000', padding: 24, paddingTop: 56, paddingBottom: 48, gap: 32 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backText: { color: '#1DB954', fontSize: 15, fontWeight: '600' },
  commissionerBadge: { fontSize: 10, fontWeight: '800', color: '#1DB954', letterSpacing: 1 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: '#fff', marginTop: -16 },

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
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: '#1DB954' },

  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  memberName: { flex: 1, fontSize: 15, color: '#fff', fontWeight: '500' },
  memberBadges: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  commBadge: { fontSize: 9, fontWeight: '800', color: '#1DB954', letterSpacing: 1 },
  roleBadge: { fontSize: 9, fontWeight: '700', color: '#555', letterSpacing: 1 },
  roleBadgeSpectator: { color: '#444' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 16, paddingBottom: 48 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  input: { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 14, fontSize: 16, color: '#fff', borderWidth: 1, borderColor: '#333' },
  sheetActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  cancelBtnText: { color: '#888', fontSize: 15, fontWeight: '600' },
  createBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#1DB954', alignItems: 'center' },
  btnDisabled: { opacity: 0.4 },
  createBtnText: { color: '#000', fontSize: 15, fontWeight: '700' },
});
