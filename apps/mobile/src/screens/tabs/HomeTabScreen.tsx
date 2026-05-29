// Home tab — Phase 5 rewrite.
//
// Composes the editorial layout from `ui-preview/index.tsx` against real
// data: league header + avatar stack, hero round card, playlist rail of
// past rounds, seasons list. Screens are dumb — every data dependency is a
// hook from `@/queries/*`.
//
// Commissioner affordances (+ Season, + Round) are intentionally ugly text
// buttons in the PageHeader trailing slot. Visual treatment lands in v2.

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { armZoomTransition } from 'native-zoom';

import { useSession } from '@/context/SessionContext';
import { useLeague as useLeagueContext } from '@/context/LeagueContext';

import { useLeague } from '@/queries/useLeague';
import { useActiveSeasonForLeague } from '@/queries/useActiveSeasonForLeague';
import { useActiveRoundForLeague } from '@/queries/useActiveRoundForLeague';
import { useRound } from '@/queries/useRound';
import { useRoundSubmissions } from '@/queries/useRoundSubmissions';
import { useSeasonsForLeague } from '@/queries/useSeasonsForLeague';
import { useRoundsForSeason } from '@/queries/useRoundsForSeason';
import { useSeasonStandings } from '@/queries/useSeasonStandings';
import { useSubmissionCountsForRounds } from '@/queries/useSubmissionCountsForRounds';

import { PageHeader } from '@/ui/PageHeader';
import { Wallpaper } from '@/ui/Wallpaper';
import { HaloText } from '@/ui/HaloText';
import { FittedChromeTitle } from '@/ui/FittedChromeTitle';
import { SectionHeader } from '@/ui/sections/SectionHeader';
import { SeasonsList, type SeasonsListSeason } from '@/ui/sections/SeasonsList';
import { HeroRoundCard, type HeroStatus } from '@/ui/cards/HeroRoundCard';
import { PlaylistRail } from '@/ui/cards/PlaylistRail';
import { useTabBarBottomInset } from '@/ui/hooks/useTabBarBottomInset';
import { THEME } from '@/ui/theme';

import { derivePhase, formatPhaseCountdown } from '@/lib/utils/phase';
import { roundCoverKey } from '@/lib/utils/coverKey';

const HOME_HERO_IMAGE_KEY = 'disco-balloon-hero';

// Map our phase enum onto HeroRoundCard's status enum. "voting" stays
// "voting" (which renders as "Live round · vote open"), submissions/results
// pass through, "upcoming" maps to "upcoming".
function phaseToHeroStatus(
  phase: 'upcoming' | 'submissions' | 'voting' | 'results',
): HeroStatus {
  return phase;
}

// Cooldown to prevent overlapping iOS zoom transitions (matches preview).
function useZoomCooldown() {
  const cooldownUntil = useRef(0);
  const wasUnfocused = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (wasUnfocused.current) {
        cooldownUntil.current = Date.now() + 400;
      }
      return () => {
        wasUnfocused.current = true;
      };
    }, []),
  );

  return useCallback(
    (armId: string | null, navigate: () => void) => {
      if (Date.now() < cooldownUntil.current) return;
      cooldownUntil.current = Date.now() + 600;
      // Only arm the iOS .zoom transition when the destination renders a
      // hero we're "opening into". For phases without a hero (submissions,
      // voting) the default push animation is correct — a card zoom into
      // a flat page reads as a UI bug.
      if (armId) armZoomTransition(armId);
      navigate();
    },
    [],
  );
}

export function HomeTabScreen() {
  const router = useRouter();
  const { supabaseUserId } = useSession();
  const { activeLeagueId, loading: leagueLoading } = useLeagueContext();
  const bottomInset = useTabBarBottomInset();
  const armAndPush = useZoomCooldown();

  // Empty / loading states ----------------------------------------------------

  if (leagueLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={THEME.ink} />
      </View>
    );
  }

  if (!activeLeagueId) {
    return <CreateLeagueEmptyState />;
  }

  return (
    <HomeTabContent
      leagueId={activeLeagueId}
      userId={supabaseUserId}
      router={router}
      bottomInset={bottomInset}
      armAndPush={armAndPush}
    />
  );
}

// All hooks live inside this child so they're only mounted when there's
// actually an active league. Keeps hook count stable per render.
function HomeTabContent({
  leagueId,
  userId,
  router,
  bottomInset,
  armAndPush,
}: {
  leagueId: string;
  userId: string | null;
  router: ReturnType<typeof useRouter>;
  bottomInset: number;
  armAndPush: (armId: string | null, navigate: () => void) => void;
}) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Mirrors the invalidations submitVotes / forceEndRound trigger — nukes
    // the active-round selection + season rounds (rail) so the whole home
    // surface re-fetches in one pull.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['league'] }),
      queryClient.invalidateQueries({ queryKey: ['season'] }),
      queryClient.invalidateQueries({ queryKey: ['round'] }),
    ]);
    setRefreshing(false);
  }, [queryClient]);

  const { data: league } = useLeague(leagueId);
  const { data: activeSeason } = useActiveSeasonForLeague(leagueId);
  const { data: activeRoundLookup } = useActiveRoundForLeague(leagueId);
  const activeRoundId = activeRoundLookup?.round?.roundId;
  const { data: round } = useRound(activeRoundId);
  const { data: submissions = [] } = useRoundSubmissions(activeRoundId);
  const { data: seasons = [] } = useSeasonsForLeague(leagueId);

  // Past rounds rail: prefer the active season's completed rounds, fall
  // back to the most recent completed season's rounds if the active season
  // has none yet. Cap N = 8 to keep the rail tidy.
  const completedSeason = useMemo(() => {
    return seasons.find((s) => s.status === 'completed') ?? undefined;
  }, [seasons]);

  const { data: activeSeasonRounds = [] } = useRoundsForSeason(activeSeason?.id);
  const { data: completedSeasonRounds = [] } = useRoundsForSeason(
    completedSeason?.id,
  );

  const railRounds = useMemo(() => {
    const now = Date.now();
    type RailRound = {
      id: string;
      prompt: string;
      round_number: number;
      voting_deadline_at: string;
      seasonName: string;
      seasonId: string;
    };
    const fromActive: RailRound[] = activeSeasonRounds
      .filter((r) => new Date(r.voting_deadline_at).getTime() <= now)
      .map((r) => ({
        ...r,
        seasonName: 'Current',
        seasonId: activeSeason?.id ?? '',
      }));
    const fromCompleted: RailRound[] = completedSeasonRounds
      .filter((r) => new Date(r.voting_deadline_at).getTime() <= now)
      .map((r) => ({
        ...r,
        seasonName: completedSeason?.name ?? 'Past',
        seasonId: completedSeason?.id ?? '',
      }));
    // Most recent first (by voting_deadline_at).
    const merged = [...fromActive, ...fromCompleted].sort(
      (a, b) =>
        new Date(b.voting_deadline_at).getTime() -
        new Date(a.voting_deadline_at).getTime(),
    );
    return merged.slice(0, 8);
  }, [activeSeasonRounds, completedSeasonRounds, activeSeason, completedSeason]);

  const railRoundIds = useMemo(() => railRounds.map((r) => r.id), [railRounds]);
  const { data: railSubmissionCounts = {} } =
    useSubmissionCountsForRounds(railRoundIds);

  // Standings: only fetch for the active season + (at most) one completed
  // season. Avoids N+1 fetches if the league has many seasons.
  const { data: activeStandings = [] } = useSeasonStandings(activeSeason?.id);
  const { data: completedStandings = [] } = useSeasonStandings(
    completedSeason?.id,
  );

  // Seasons list mapping with `you` rank/points + champion name.
  const seasonsForList: SeasonsListSeason[] = useMemo(() => {
    return seasons.map((s) => {
      const status: 'active' | 'completed' =
        s.status === 'active' ? 'active' : 'completed';
      let standings: typeof activeStandings = [];
      if (s.id === activeSeason?.id) standings = activeStandings;
      else if (s.id === completedSeason?.id) standings = completedStandings;

      // Standings come back sorted DESC by total_points server-side per the
      // SQL function. We trust that ordering for rank derivation.
      const meIndex = userId
        ? standings.findIndex((row) => row.user_id === userId)
        : -1;
      const you =
        meIndex >= 0
          ? {
              rank: meIndex + 1,
              points: standings[meIndex]?.total_points ?? 0,
            }
          : undefined;
      const championName =
        status === 'completed' ? standings[0]?.display_name : undefined;

      return {
        id: s.id,
        name: s.name,
        status,
        you,
        championName,
      };
    });
  }, [
    seasons,
    activeSeason,
    completedSeason,
    activeStandings,
    completedStandings,
    userId,
  ]);

  // Hero card data.
  const hero = useMemo(() => {
    if (!round) return null;
    const phase = derivePhase(round);
    const phaseLabel = formatPhaseCountdown(round);
    const status = phaseToHeroStatus(phase);
    const submittedCount = submissions.length;
    const descriptor = round.seasons?.name
      ? `Round ${String(round.round_number).padStart(2, '0')} · ${round.seasons.name}`
      : `Round ${String(round.round_number).padStart(2, '0')}`;
    const ctaLabel =
      phase === 'voting' || phase === 'submissions'
        ? `${submittedCount} picks in · tap to ${phase === 'voting' ? 'vote' : 'submit'} →`
        : phase === 'results'
          ? 'tap to see results →'
          : undefined;
    return {
      id: round.id,
      prompt: round.prompt,
      descriptor,
      phaseLabel,
      status,
      ctaLabel,
      imageKey: HOME_HERO_IMAGE_KEY,
    };
  }, [round, submissions]);

  // Commissioner check uses the queried league (context exposes only id/name).
  const isCommissioner = !!league && !!userId && league.admin_user_id === userId;

  const goToRound = useCallback(
    (roundId: string, zoomKey: string | null) => {
      armAndPush(zoomKey, () => {
        router.push({
          pathname: '/(tabs)/(home)/round/[id]',
          params: { id: roundId },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      });
    },
    [router, armAndPush],
  );

  const goToSeason = useCallback(
    (seasonId: string) => {
      router.push({
        pathname: '/(tabs)/(home)/season/[id]',
        params: { id: seasonId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    },
    [router],
  );

  // TODO: redesign in v2 — these commissioner buttons are functional
  // placeholders; the real layout/icons land in a later phase.
  const commissionerTrailing = isCommissioner ? (
    <View style={styles.commishRow}>
      <TouchableOpacity
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onPress={() => router.push('/(tabs)/(home)/create-season' as any)}
        style={styles.commishBtn}
      >
        <Text style={styles.commishBtnText}>+ Season</Text>
      </TouchableOpacity>
      {activeSeason?.id ? (
        <TouchableOpacity
          onPress={() => goToSeason(activeSeason.id)}
          style={styles.commishBtn}
        >
          <Text style={styles.commishBtnText}>+ Round</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  ) : undefined;

  return (
    <Wallpaper>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: bottomInset }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={THEME.ink}
            />
          }
        >
          <PageHeader
            leagueTag={league?.name}
            title="Home"
            trailing={commissionerTrailing}
          />

          {hero ? (
            <>
              <HeroRoundCard
                prompt={hero.prompt}
                descriptor={hero.descriptor}
                phaseLabel={hero.phaseLabel}
                ctaLabel={hero.ctaLabel}
                status={hero.status}
                imageKey={hero.imageKey}
                zoomSourceId={`round-${hero.id}`}
                onPress={() =>
                  goToRound(
                    hero.id,
                    // Zoom into the destination whenever it shows a hero
                    // image at the top — currently voting (custom VoteHero)
                    // and results (HeroBanner). Submissions stays as a
                    // default push since it has no hero.
                    hero.status === 'voting' || hero.status === 'results'
                      ? `round-${hero.id}`
                      : null,
                  )
                }
              />

              {/* Chrome tether — a short vertical line that visually ties the
                  active card to the round title below it. Reads as the card
                  "dripping" into the headline. */}
              <View style={styles.tether} />

              {/* Round title block — italic Fraunces headline + chrome ★, set
                  against a dual-layer radial halo. Sits directly below the
                  active card, matching the Bubblegum home spec. */}
              <View style={styles.roundTitleBlock}>
                <Text style={styles.roundTitleTagline}>this sounds like</Text>
                <HaloText style={styles.roundTitleHaloWrap}>
                  <FittedChromeTitle
                    text={hero.prompt.toUpperCase()}
                    textStyle={styles.roundTitleText}
                    minimumFontScale={0.58}
                    maxStarSize={32}
                  />
                </HaloText>
              </View>

            </>
          ) : (
            // TODO: redesign in v2 — minimal placeholder card for the
            // between-rounds case (active season but no live round, or
            // no active season at all).
            <View style={styles.betweenCard}>
              <Text style={styles.betweenLabel}>Up next</Text>
              <Text style={styles.betweenBody}>
                {activeSeason
                  ? 'No live round right now. The next one opens soon.'
                  : 'No active season yet.'}
              </Text>
            </View>
          )}

          {railRounds.length > 0 ? (
            <>
              {/* Section row with an inline rule: title left, hairline gray
                  line in the middle, trailing label + chevron on the right.
                  This row IS the separator — no extra divider above it. */}
              <View style={styles.sectionRuleRow}>
                <Text style={styles.sectionRuleTitle}>
                  YOUR ROUNDS
                </Text>
                <View style={styles.sectionRuleLine} />
                <Text style={styles.sectionRuleTrailing}>
                  ALL SEASONS ›
                </Text>
              </View>
              <PlaylistRail
                items={railRounds.map((r) => {
                  const tracks = railSubmissionCounts[r.id] ?? 0;
                  const meta = `${r.seasonName} · R${String(r.round_number).padStart(2, '0')} · ${tracks} tracks`;
                  const zoomKey = `round-${r.id}`;
                  return {
                    id: r.id,
                    prompt: r.prompt,
                    meta,
                    imageKey: roundCoverKey(r),
                    zoomSourceId: zoomKey,
                    onPress: () => goToRound(r.id, zoomKey),
                  };
                })}
              />
            </>
          ) : null}

          {/* Seasons list intentionally hidden — revisit when the seasons
              surface gets its own bubblegum treatment. The data setup
              (seasonsForList useMemo) stays so re-enabling is a one-line
              re-render. */}
          {/* {seasonsForList.length > 0 ? (
            <SeasonsList seasons={seasonsForList} onPress={goToSeason} />
          ) : null} */}
        </ScrollView>
      </SafeAreaView>
    </Wallpaper>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function CreateLeagueEmptyState() {
  const router = useRouter();
  return (
    <Wallpaper>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <PageHeader title="mix" />
        <View style={styles.emptyBody}>
          <Text style={styles.emptyHeadline}>No league yet</Text>
          <Text style={styles.emptySub}>
            Create your own or join one with an invite link.
          </Text>
          <Pressable
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onPress={() => router.push('/(tabs)/(home)/create-league' as any)}
            style={styles.emptyBtn}
          >
            <Text style={styles.emptyBtnText}>Create a League</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Wallpaper>
  );
}

const styles = StyleSheet.create({
  // Thin gray vertical line tethering the active hero card to the round
  // title below. Same hairline weight as the section rule for visual
  // continuity.
  tether: {
    alignSelf: 'center',
    width: 1,
    height: 22,
    backgroundColor: 'rgba(26,8,20,0.28)',
    marginTop: 4,
  },

  // Inline section rule: "YOUR ROUNDS ──── ALL SEASONS ›". The hairline
  // between the labels IS the visual separator from the round title area
  // above — no standalone divider needed.
  sectionRuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    marginTop: 8,
    marginBottom: 10,
    gap: 10,
  },
  sectionRuleTitle: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.8,
    color: THEME.ink,
  },
  sectionRuleLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(26,8,20,0.28)',
  },
  sectionRuleTrailing: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.8,
    color: THEME.ink,
  },

  // Round title block below the active hero card.
  roundTitleBlock: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
    gap: 4,
    paddingHorizontal: 22,
    overflow: 'visible',
  },
  roundTitleTagline: {
    fontFamily: THEME.fonts.serifItalic,
    fontSize: 17,
    color: THEME.ink,
    // Raise above HaloText's spill so the blur doesn't capture this label.
    zIndex: 2,
  },
  roundTitleHaloWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 18,
    paddingVertical: 14,
    overflow: 'visible',
  },
  roundTitleText: {
    fontFamily: THEME.fonts.serifBoldItalic,
    fontSize: 52,
    lineHeight: 56,
    letterSpacing: -2.2,
    color: THEME.ink,
    textAlign: 'center',
  },
  root: { flex: 1, backgroundColor: THEME.bg },
  loading: {
    flex: 1,
    backgroundColor: THEME.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Commissioner buttons (TODO: redesign in v2).
  commishRow: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 8,
  },
  commishBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.ink,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  commishBtnText: {
    color: THEME.ink,
    fontSize: 12,
    fontWeight: '600',
  },

  // Between-rounds placeholder (TODO: redesign in v2).
  betweenCard: {
    marginHorizontal: 22,
    marginTop: 14,
    padding: 22,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.rule,
  },
  betweenLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  betweenBody: {
    marginTop: 6,
    fontSize: 16,
    color: THEME.ink,
    opacity: 0.7,
  },

  // Empty state.
  emptyBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyHeadline: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.ink,
  },
  emptySub: {
    fontSize: 14,
    color: THEME.ink,
    opacity: 0.65,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyBtn: {
    marginTop: 8,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: THEME.ink,
  },
  emptyBtnText: {
    color: THEME.bg,
    fontSize: 15,
    fontWeight: '700',
  },
});
