import { useCallback, useState } from 'react';
import {
  RefreshControl, ScrollView, View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Share, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { GlassCard } from '@/components/nocturne/GlassCard';
import { Eyebrow } from '@/components/nocturne/Eyebrow';
import { Chip } from '@/components/nocturne/Chip';
import { nocturne } from '@/theme/colors';
import { fonts } from '@/theme/fonts';

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

type Round = {
  id: string;
  round_number: number;
  submission_deadline_at: string;
  voting_deadline_at: string;
};

type RoundStatus = 'completed' | 'active-voting' | 'active-submissions' | 'upcoming';

type ActiveRoundInfo = {
  roundNumber: number;
  phase: 'voting' | 'submissions';
  deadline: string; // ISO
};

function computeRoundStatus(round: Round, prevRound: Round | null): RoundStatus {
  const now = Date.now();
  const subDeadline = new Date(round.submission_deadline_at).getTime();
  const voteDeadline = new Date(round.voting_deadline_at).getTime();

  // Sequential: a round can only start once the previous has completed voting.
  const prevDone = !prevRound || now >= new Date(prevRound.voting_deadline_at).getTime();
  if (!prevDone) return 'upcoming';

  if (now < subDeadline) return 'active-submissions';
  if (now < voteDeadline) return 'active-voting';
  return 'completed';
}

function formatTimeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'closing';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

// Deterministic color from a name for avatars
const AVATAR_COLORS = [nocturne.blue, nocturne.blueLight, nocturne.gold, nocturne.mint, nocturne.rose];
function avatarColor(name: string, index: number) {
  return AVATAR_COLORS[(name.charCodeAt(0) + index) % AVATAR_COLORS.length];
}

function Avatar({ name, size = 28, index = 0 }: { name: string; size?: number; index?: number }) {
  const c = avatarColor(name, index);
  return (
    <View style={[avStyles.circle, { width: size, height: size, borderRadius: size / 2, borderColor: c }]}>
      <Text style={[avStyles.initial, { fontSize: size * 0.42, fontFamily: fonts.serif }]}>
        {name[0]?.toUpperCase() ?? '?'}
      </Text>
    </View>
  );
}

const avStyles = StyleSheet.create({
  circle: {
    backgroundColor: nocturne.bg2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  initial: {
    color: nocturne.ink,
    fontWeight: '500',
  },
});

export function LeagueScreen({ leagueId }: { leagueId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [league, setLeague] = useState<League | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [activeRounds, setActiveRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [{ data: { user } }, { data: leagueData }, { data: seasonsData }, { data: membersData }] =
      await Promise.all([
        supabase.auth.getUser(),
        supabase.from('leagues').select('id, name, admin_user_id').eq('id', leagueId).single(),
        supabase
          .from('seasons')
          .select('id, name, season_number, status, invite_token')
          .eq('league_id', leagueId)
          .order('season_number', { ascending: false }),
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

    // Fetch rounds for the active season (for progress bar + current round info)
    const active = (seasonsData ?? []).find((s) => s.status === 'active');
    if (active) {
      const { data: roundsData } = await supabase
        .from('rounds')
        .select('id, round_number, submission_deadline_at, voting_deadline_at')
        .eq('season_id', active.id)
        .order('round_number', { ascending: true });
      setActiveRounds(roundsData ?? []);
    } else {
      setActiveRounds([]);
    }

    setLoading(false);
  }, [leagueId]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const isCommissioner = league?.admin_user_id === supabaseUserId;
  const activeSeason = seasons.find((s) => s.status === 'active');
  const pastSeasons = seasons.filter((s) => s.status !== 'active');

  // Compute round statuses + current active round info
  const roundStatuses: RoundStatus[] = activeRounds.map((r, i) =>
    computeRoundStatus(r, i > 0 ? activeRounds[i - 1] : null),
  );
  const completedCount = roundStatuses.filter((s) => s === 'completed').length;
  const activeRoundIndex = roundStatuses.findIndex(
    (s) => s === 'active-voting' || s === 'active-submissions',
  );
  let currentRound: ActiveRoundInfo | null = null;
  if (activeRoundIndex >= 0) {
    const r = activeRounds[activeRoundIndex];
    const status = roundStatuses[activeRoundIndex];
    currentRound = {
      roundNumber: r.round_number,
      phase: status === 'active-voting' ? 'voting' : 'submissions',
      deadline:
        status === 'active-voting' ? r.voting_deadline_at : r.submission_deadline_at,
    };
  }

  const handleNewSeason = async () => {
    const { data: liveRounds } = await supabase
      .from('rounds')
      .select('id, seasons!inner(league_id)')
      .gt('voting_deadline_at', new Date().toISOString())
      .eq('seasons.league_id', leagueId);

    if (liveRounds && liveRounds.length > 0) {
      Alert.alert(
        'Season in progress',
        'Wait for the current season to finish before creating a new one.',
      );
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.push('/(tabs)/(home)/create-season' as any);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={nocturne.blue} />
      </View>
    );
  }

  if (!league) {
    return (
      <View style={styles.centered}>
        <Text style={styles.mutedText}>League not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.root, { paddingTop: insets.top + 16 }]}
      style={styles.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={nocturne.blue} />
      }
    >
      {/* ── League header ── */}
      <View style={styles.leagueHeader}>
        <Eyebrow>Your league</Eyebrow>
        <Text style={styles.leagueName}>
          {league.name}
          <Text style={{ color: nocturne.blueLight }}>.</Text>
        </Text>
        {isCommissioner && (
          <Text style={styles.commBadge}>COMMISSIONER</Text>
        )}
      </View>

      {/* ── Avatar stack ── */}
      <View style={styles.avatarRow}>
        <View style={styles.avatarStack}>
          {members.slice(0, 6).map((m, i) => (
            <View key={m.user_id} style={[styles.avatarWrap, i > 0 && { marginLeft: -8 }]}>
              <Avatar name={m.display_name} size={28} index={i} />
            </View>
          ))}
        </View>
        {members.length > 6 && (
          <Text style={styles.memberCount}>+{members.length - 6}</Text>
        )}
        <Text style={styles.memberLabel}> · {members.length} members</Text>
      </View>

      {/* ── Active season hero card ── */}
      {activeSeason && (
        <TouchableOpacity
          activeOpacity={0.92}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => router.push({ pathname: '/(tabs)/(home)/season/[id]' as any, params: { id: activeSeason.id } })}
        >
          <GlassCard style={styles.heroCard}>
            <View style={styles.heroContent}>
              <View style={styles.heroTopRow}>
                <Chip label="Active season" color={nocturne.gold} />
                {activeRounds.length > 0 && (
                  <Text style={styles.heroRoundCount}>
                    {completedCount}/{activeRounds.length} rounds
                  </Text>
                )}
              </View>
              <Text style={styles.heroSeasonName}>{activeSeason.name}</Text>

              {/* Current round status (Round N · phase · Xd Xh left) */}
              {currentRound ? (
                <Text style={styles.heroSubtitle}>
                  Round {String(currentRound.roundNumber).padStart(2, '0')} ·{' '}
                  {currentRound.phase} · {formatTimeLeft(currentRound.deadline)}
                </Text>
              ) : activeRounds.length > 0 ? (
                <Text style={styles.heroSubtitle}>Between rounds</Text>
              ) : (
                <Text style={styles.heroSubtitle}>No rounds yet</Text>
              )}

              {/* Segmented progress bar (one segment per round) */}
              {activeRounds.length > 0 && (
                <View style={styles.progressRow}>
                  {roundStatuses.map((s, i) => {
                    const c =
                      s === 'completed'
                        ? nocturne.completed
                        : s === 'active-voting' || s === 'active-submissions'
                        ? nocturne.active
                        : nocturne.upcoming;
                    const isActive = s === 'active-voting' || s === 'active-submissions';
                    return (
                      <View
                        key={i}
                        style={[
                          styles.progressSeg,
                          {
                            backgroundColor: c,
                            shadowColor: c,
                            shadowOpacity: isActive ? 1 : 0,
                            shadowRadius: 6,
                            shadowOffset: { width: 0, height: 0 },
                          },
                        ]}
                      />
                    );
                  })}
                </View>
              )}

              {/* CTA */}
              <TouchableOpacity
                style={styles.heroCta}
                activeOpacity={0.8}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onPress={() => router.push({ pathname: '/(tabs)/(home)/season/[id]' as any, params: { id: activeSeason.id } })}
              >
                <Text style={styles.heroCtaText}>Open season →</Text>
              </TouchableOpacity>

              {/* Share invite — stop propagation so tapping doesn't open the season */}
              {isCommissioner && (
                <TouchableOpacity
                  style={styles.shareBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    Share.share({ message: `Join ${league.name} on mix!\nmix://join?token=${activeSeason.invite_token}` });
                  }}
                >
                  <Text style={styles.shareBtnText}>Share Invite Link</Text>
                </TouchableOpacity>
              )}
            </View>
          </GlassCard>
        </TouchableOpacity>
      )}

      {/* ── No active season — commissioner CTA ── */}
      {!activeSeason && isCommissioner && (
        <GlassCard>
          <Text style={styles.emptySeasonTitle}>No active season</Text>
          <Text style={styles.emptySeasonBody}>
            Start a new season to kick things off.
          </Text>
          <TouchableOpacity style={styles.heroCta} onPress={handleNewSeason}>
            <Text style={styles.heroCtaText}>Create season →</Text>
          </TouchableOpacity>
        </GlassCard>
      )}

      {/* ── Past seasons ── */}
      {pastSeasons.length > 0 && (
        <View style={styles.pastSection}>
          <Eyebrow>Past seasons</Eyebrow>
          {pastSeasons.map((season) => (
            <TouchableOpacity
              key={season.id}
              activeOpacity={0.7}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onPress={() => router.push({ pathname: '/(tabs)/(home)/season/[id]' as any, params: { id: season.id } })}
            >
              <GlassCard style={styles.pastCard}>
                <View style={styles.pastCardInner}>
                  {/* Decorative art square */}
                  <LinearGradient
                    colors={[
                      AVATAR_COLORS[season.season_number % AVATAR_COLORS.length],
                      nocturne.bg2,
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.pastArt}
                  />
                  <View style={styles.pastInfo}>
                    <Text style={styles.pastName}>{season.name}</Text>
                    <Text style={styles.pastMeta}>
                      Season {season.season_number} · {season.status}
                    </Text>
                  </View>
                </View>
              </GlassCard>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── New season button (commissioner, has active) ── */}
      {isCommissioner && activeSeason && (
        <TouchableOpacity style={styles.newSeasonBtn} onPress={handleNewSeason}>
          <Text style={styles.newSeasonBtnText}>+ New Season</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mutedText: { color: nocturne.inkMuted, fontSize: 15, fontFamily: fonts.sans },
  scroll: { flex: 1 },
  root: { padding: 22, paddingBottom: 140, gap: 18 },

  // League header
  leagueHeader: { gap: 4 },
  leagueName: {
    fontFamily: fonts.serifBlack,
    fontSize: 36,
    color: nocturne.ink,
    letterSpacing: -0.8,
    lineHeight: 40,
  },
  commBadge: {
    fontSize: 10,
    fontFamily: fonts.sansSemiBold,
    color: nocturne.blue,
    letterSpacing: 1.2,
    marginTop: 2,
  },

  // Avatar row
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  avatarStack: { flexDirection: 'row' },
  avatarWrap: { zIndex: 1 },
  memberCount: { fontSize: 12, color: nocturne.inkMuted, fontFamily: fonts.sansMedium },
  memberLabel: { fontSize: 12, color: nocturne.inkMuted, fontFamily: fonts.sans },

  // Hero card
  heroCard: {
    borderColor: nocturne.blue + '55',
    overflow: 'hidden',
  },
  heroContent: { gap: 10 },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroRoundCount: {
    fontSize: 11,
    color: nocturne.inkMuted,
    fontFamily: fonts.sans,
  },
  heroSeasonName: {
    fontFamily: fonts.serifBlack,
    fontSize: 30,
    color: nocturne.ink,
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  heroSubtitle: {
    fontSize: 13,
    color: nocturne.inkMuted,
    fontFamily: fonts.sans,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 10,
  },
  progressSeg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  heroCta: {
    marginTop: 6,
    width: '100%',
    paddingVertical: 13,
    backgroundColor: '#fff',
    borderRadius: 14,
    alignItems: 'center',
  },
  heroCtaText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    color: nocturne.bg,
  },
  shareBtn: {
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: nocturne.cardBorder,
    alignItems: 'center',
  },
  shareBtnText: {
    fontSize: 13,
    color: nocturne.inkMuted,
    fontFamily: fonts.sansMedium,
  },

  // Empty season
  emptySeasonTitle: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: nocturne.ink,
  },
  emptySeasonBody: {
    fontSize: 13,
    color: nocturne.inkMuted,
    fontFamily: fonts.sans,
    marginTop: 4,
    marginBottom: 8,
  },

  // Past seasons
  pastSection: { gap: 8 },
  pastCard: { borderRadius: 18 },
  pastCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pastArt: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  pastInfo: { flex: 1 },
  pastName: {
    fontFamily: fonts.serif,
    fontSize: 16,
    color: nocturne.ink,
  },
  pastMeta: {
    fontSize: 11,
    color: nocturne.inkMuted,
    fontFamily: fonts.sans,
    marginTop: 2,
  },

  // New season
  newSeasonBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: nocturne.blue,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  newSeasonBtnText: {
    fontSize: 13,
    fontFamily: fonts.sansSemiBold,
    color: '#fff',
  },
});
