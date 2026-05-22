import { useCallback, useMemo, useState } from 'react';
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
import { THEME } from '@/ui/theme';
import { PageHeader } from '@/ui/PageHeader';
import { SeasonsList, type SeasonsListSeason } from '@/ui/sections/SeasonsList';
import { AvatarStack } from '@/ui/sections/AvatarStack';
import { useTabBarBottomInset } from '@/ui/hooks/useTabBarBottomInset';

export function LeagueScreen({ leagueId }: { leagueId: string }) {
  const router = useRouter();
  const { supabaseUserId } = useSession();
  const bottomInset = useTabBarBottomInset();

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
    // FE guard: check if any season still has live rounds. Pre-existing inline
    // supabase call tracked as tech debt in CLAUDE.md; leaving for now.
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

  // Map league seasons (status: draft|active|completed) to the SeasonsList
  // model which only knows about "active" or "completed".
  const seasonListItems: SeasonsListSeason[] = useMemo(
    () =>
      seasons.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status === 'completed' ? 'completed' : 'active',
      })),
    [seasons],
  );

  if (leagueLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={THEME.muted} />
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

  // Active season with an invite token — the per-season Share button moves to
  // a single Share Invite affordance under Seasons.
  const activeSeasonWithToken = seasons.find(
    (s) => s.status === 'active' && s.invite_token,
  );

  return (
    <ScrollView
      contentContainerStyle={[styles.root, { paddingBottom: bottomInset + 24 }]}
      style={{ flex: 1, backgroundColor: THEME.bg }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={THEME.accent} />
      }
    >
      <PageHeader
        title={league.name}
        leagueTag={isCommissioner ? 'You commission this league' : undefined}
        trailing={
          isCommissioner ? (
            <TouchableOpacity onPress={handleNewSeason} style={styles.headerActionBtn}>
              <Text style={styles.headerActionText}>+ New Season</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* ── Seasons ── */}
      {seasonListItems.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No seasons yet.</Text>
          {isCommissioner && (
            <TouchableOpacity onPress={handleNewSeason}>
              <Text style={styles.emptyLink}>Create the first season →</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          <SeasonsList
            seasons={seasonListItems}
            onPress={(id) =>
              router.push({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                pathname: '/(tabs)/(home)/season/[id]' as any,
                params: { id },
              })
            }
          />
          {isCommissioner && activeSeasonWithToken && (
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={() =>
                Share.share({
                  message: `Join ${league.name} on mix!\nmix://join?token=${activeSeasonWithToken.invite_token}`,
                })
              }
            >
              <Text style={styles.shareBtnText}>Share Invite Link</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* ── Members ── */}
      <View style={styles.membersSection}>
        <View style={styles.membersHeader}>
          <Text style={styles.membersLabel}>Members</Text>
          <AvatarStack
            participants={members.map((m) => ({
              id: m.user_id,
              displayName: m.display_name,
            }))}
            size={28}
          />
        </View>
        {members.map((m) => (
          <View key={m.user_id} style={styles.memberRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {m.display_name[0]?.toUpperCase() ?? '?'}
              </Text>
            </View>
            <Text style={styles.memberName}>{m.display_name}</Text>
            <View style={styles.memberBadges}>
              {m.user_id === league.admin_user_id && (
                <Text style={styles.commBadge}>COMM</Text>
              )}
              <Text
                style={[
                  styles.roleBadge,
                  m.role === 'spectator' && styles.roleBadgeSpectator,
                ]}
              >
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
  centered: {
    flex: 1,
    backgroundColor: THEME.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutedText: { color: THEME.muted, fontSize: 15, fontFamily: THEME.fonts.sansMedium },

  root: { backgroundColor: THEME.bg, gap: 0 },

  headerActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: THEME.ink,
  },
  headerActionText: {
    fontFamily: THEME.fonts.sansSemi,
    fontSize: 12,
    color: '#fff',
  },

  empty: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
    paddingHorizontal: 22,
  },
  emptyText: { fontSize: 14, color: THEME.muted, fontFamily: THEME.fonts.sansMedium },
  emptyLink: { fontSize: 14, color: THEME.accent, fontFamily: THEME.fonts.sansSemi },

  shareBtn: {
    marginTop: 14,
    marginHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.rule,
    alignItems: 'center',
    backgroundColor: THEME.surface,
  },
  shareBtnText: { fontSize: 13, color: THEME.ink, fontFamily: THEME.fonts.sansSemi },

  membersSection: {
    marginTop: 32,
    paddingHorizontal: 22,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: THEME.rule,
    gap: 12,
  },
  membersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  membersLabel: {
    ...THEME.text.seasonsLabel,
  },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: THEME.rule,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: THEME.faint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontFamily: THEME.fonts.sansBold, color: '#fff' },
  memberName: {
    flex: 1,
    fontSize: 15,
    color: THEME.ink,
    fontFamily: THEME.fonts.sansSemi,
  },
  memberBadges: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  commBadge: {
    fontSize: 9,
    fontFamily: THEME.fonts.sansBold,
    color: THEME.accent,
    letterSpacing: 1,
  },
  roleBadge: {
    fontSize: 9,
    fontFamily: THEME.fonts.sansBold,
    color: THEME.muted,
    letterSpacing: 1,
  },
  roleBadgeSpectator: { color: THEME.faint },
});
