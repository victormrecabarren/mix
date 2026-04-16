import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

type Season = {
  id: string;
  name: string;
  season_number: number;
  status: string;
  league_id: string;
  leagues: { id: string; name: string; admin_user_id: string } | null;
};

type Round = {
  id: string;
  round_number: number;
  prompt: string;
  submission_deadline_at: string;
  voting_deadline_at: string;
};

type Member = {
  user_id: string;
  role: string;
  display_name: string;
};

function roundStatus(round: Round): { label: string; color: string } {
  const now = Date.now();
  const subDeadline = new Date(round.submission_deadline_at).getTime();
  const voteDeadline = new Date(round.voting_deadline_at).getTime();

  if (now < subDeadline) return { label: 'SUBMISSIONS OPEN', color: '#1DB954' };
  if (now < voteDeadline) return { label: 'VOTING OPEN', color: '#f0a500' };
  return { label: 'COMPLETED', color: '#555' };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function SeasonScreen({ seasonId }: { seasonId: string }) {
  const router = useRouter();

  const [season, setSeason] = useState<Season | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { data: seasonData } = await supabase
      .from('seasons')
      .select('id, name, season_number, status, league_id, leagues(id, name, admin_user_id)')
      .eq('id', seasonId)
      .single();

    if (!seasonData) { setLoading(false); return; }

    const league = Array.isArray(seasonData.leagues) ? seasonData.leagues[0] : seasonData.leagues;

    const [{ data: roundsData }, { data: membersData }] = await Promise.all([
      supabase
        .from('rounds')
        .select('id, round_number, prompt, submission_deadline_at, voting_deadline_at')
        .eq('season_id', seasonId)
        .order('round_number', { ascending: true }),
      supabase
        .from('league_members')
        .select('user_id, role, users(display_name)')
        .eq('league_id', seasonData.league_id)
        .order('joined_at', { ascending: true }),
    ]);

    setSeason({ ...seasonData, leagues: league ?? null });
    setRounds(roundsData ?? []);
    setMembers(
      (membersData ?? []).map((m) => ({
        user_id: m.user_id,
        role: m.role,
        display_name:
          (Array.isArray(m.users)
            ? m.users[0]?.display_name
            : (m.users as { display_name: string } | null)?.display_name) ?? 'Unknown',
      })),
    );
    setLoading(false);
  }, [seasonId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color="#555" /></View>;
  }

  if (!season) {
    return <View style={styles.centered}><Text style={styles.mutedText}>Season not found.</Text></View>;
  }

  const league = season.leagues;

  return (
    <ScrollView contentContainerStyle={styles.root} style={{ backgroundColor: '#000' }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← {league?.name ?? 'Back'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.pageTitle}>{season.name}</Text>
        <View style={[styles.statusBadge, season.status === 'active' ? styles.statusActive : styles.statusDone]}>
          <Text style={styles.statusText}>{season.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.seasonMeta}>Season {season.season_number}</Text>

      {/* ── Rounds ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Rounds ({rounds.length})</Text>

        {rounds.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No rounds yet.</Text>
          </View>
        ) : (
          rounds.map((round) => {
            const { label, color } = roundStatus(round);
            return (
              <View key={round.id} style={styles.roundCard}>
                <View style={styles.roundHeader}>
                  <Text style={styles.roundNumber}>Round {round.round_number}</Text>
                  <Text style={[styles.roundStatus, { color }]}>{label}</Text>
                </View>
                <Text style={styles.roundPrompt}>{round.prompt}</Text>
                <View style={styles.roundDates}>
                  <Text style={styles.dateLabel}>Subs due <Text style={styles.dateValue}>{formatDate(round.submission_deadline_at)}</Text></Text>
                  <Text style={styles.dateLabel}>Votes due <Text style={styles.dateValue}>{formatDate(round.voting_deadline_at)}</Text></Text>
                </View>
              </View>
            );
          })
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
              {m.user_id === league?.admin_user_id && (
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

  header: { flexDirection: 'row', alignItems: 'center' },
  backText: { color: '#1DB954', fontSize: 15, fontWeight: '600' },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: -16 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: '#fff', flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusActive: { backgroundColor: '#1DB95422' },
  statusDone: { backgroundColor: '#33333388' },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: '#1DB954' },
  seasonMeta: { fontSize: 13, color: '#555', marginTop: -24 },

  section: { gap: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#666', letterSpacing: 1, textTransform: 'uppercase' },

  empty: { paddingVertical: 24, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#444' },

  roundCard: { backgroundColor: '#111', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#222', gap: 8 },
  roundHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roundNumber: { fontSize: 13, fontWeight: '800', color: '#fff' },
  roundStatus: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  roundPrompt: { fontSize: 15, color: '#ccc', lineHeight: 20 },
  roundDates: { gap: 2, marginTop: 4 },
  dateLabel: { fontSize: 11, color: '#555' },
  dateValue: { color: '#888' },

  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  memberName: { flex: 1, fontSize: 15, color: '#fff', fontWeight: '500' },
  memberBadges: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  commBadge: { fontSize: 9, fontWeight: '800', color: '#1DB954', letterSpacing: 1 },
  roleBadge: { fontSize: 9, fontWeight: '700', color: '#555', letterSpacing: 1 },
  roleBadgeSpectator: { color: '#444' },
});
