// TEMP: V1 · Archive home — warm editorial minimalism.
// Direct layout port of `directions/v1-archive.jsx > aHome` from the
// Claude Design handoff. Data is placeholder, matched to the prototype's
// shared fixtures (playlist-shared.jsx).
//
// Now Playing + Tab Bar live in sibling private files — they're scoped to
// the preview for now but factored so they can graduate into the real app
// when the design direction is locked in.

import { useCallback, useMemo, useRef } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { ZoomSource, armZoomTransition } from "native-zoom";
import { NowPlayingBar } from "./_NowPlayingBar";
import { TabBar } from "./_TabBar";
import { ROUND_IMAGES, type ImageKey } from "./_images";
import { v1 } from "./_tokens";

// Where the active-card cover-fit crop is anchored in the source image.
// 0% = top of source, 100% = bottom. Raise to slide the visible slice DOWN
// the image. Iterate until the focal sits right in the 16:10 tile.
const ACTIVE_CARD_CROP_Y = "32%";

// Playlist rail layout. The rail is a horizontal scroller of 2-tall columns
// that visually matches the old 2-col square grid when at rest (2 columns
// visible = 4 tiles), but keeps growing off-screen instead of down the page.
const RAIL_H_PADDING = 22; // keeps edges aligned with the rest of the screen
const RAIL_GAP = 12; // gap between columns AND between the two rows
const RAIL_COLUMNS_VISIBLE = 2;

// ── Placeholder fixtures (mirror playlist-shared.jsx) ────────────────

const ACTIVE = {
  prompt: "A song that sounds like summer ending",
  descriptor: "Round 05 · Winter Season",
  phase: "Voting closes in 1d 11h",
  imageKey: "disco-balloon" as ImageKey,
  submitted: 12,
};

const PLAYLISTS: Array<{
  id: string;
  prompt: string;
  season: string;
  n: number;
  tracks: number;
  imageKey: ImageKey;
}> = [
  {
    id: "p1",
    prompt: "Music for reading in bed",
    season: "Winter",
    n: 4,
    tracks: 12,
    imageKey: "disco-knot",
  },
  {
    id: "p2",
    prompt: "Song you loved at 14",
    season: "Winter",
    n: 3,
    tracks: 12,
    imageKey: "disco-encrusted",
  },
  {
    id: "p3",
    prompt: "Music your parents hate",
    season: "Winter",
    n: 2,
    tracks: 12,
    imageKey: "disco-scene",
  },
  {
    id: "p4",
    prompt: "A song for a long drive",
    season: "Winter",
    n: 1,
    tracks: 12,
    imageKey: "disco-string",
  },
  {
    id: "p5",
    prompt: "Best 2000s one-hit wonder",
    season: "First",
    n: 8,
    tracks: 12,
    imageKey: "disco-knot",
  },
  {
    id: "p6",
    prompt: "A song that makes you feel seen",
    season: "First",
    n: 7,
    tracks: 12,
    imageKey: "disco-encrusted",
  },
  {
    id: "p7",
    prompt: "Best song about a city",
    season: "First",
    n: 6,
    tracks: 12,
    imageKey: "disco-scene",
  },
  {
    id: "p8",
    prompt: "A song you would play at your wedding",
    season: "First",
    n: 5,
    tracks: 12,
    imageKey: "disco-string",
  },
];

const SEASONS = [
  { id: "s2", name: "Winter Season", active: true, you: { rank: 7, pts: 58 } },
  {
    id: "s1",
    name: "First Season",
    active: false,
    you: { rank: 4, pts: 142 },
    champion: "Jules",
  },
];

const PLAYERS = [
  { n: "Nia", c: "#B4A5E8" },
  { n: "Jules", c: "#C28BD4" },
  { n: "Theo", c: "#F2C55C" },
];

// ── Screen ───────────────────────────────────────────────────────────

export default function V1ArchiveHome() {
  const router = useRouter();
  const { width: screenW } = useWindowDimensions();

  // Tile width chosen so that RAIL_COLUMNS_VISIBLE columns fit exactly inside
  // the rail's content area (screen minus horizontal padding, minus the gaps
  // between the visible columns). One tile's height is derived from aspect
  // ratio 1 in styles.
  const tileWidth =
    (screenW - RAIL_H_PADDING * 2 - RAIL_GAP * (RAIL_COLUMNS_VISIBLE - 1)) /
    RAIL_COLUMNS_VISIBLE;

  // Chunk playlists into columns of 2. Items flow top-to-bottom within a
  // column, then wrap to the next column (i.e. reading order is: [0]=col0/row0,
  // [1]=col0/row1, [2]=col1/row0, [3]=col1/row1, [4]=col2/row0, …).
  const columns = useMemo(() => {
    const out: (typeof PLAYLISTS)[number][][] = [];
    for (let i = 0; i < PLAYLISTS.length; i += 2) {
      out.push(PLAYLISTS.slice(i, i + 2));
    }
    return out;
  }, []);

  // Guard against double-opens during a closing zoom: iOS can't animate two
  // zoom transitions that target overlapping source UIViews at once, so we
  // cool down for a few hundred ms between navigations. The cooldown extends
  // when we regain focus after returning from detail (close animation is
  // finishing) and when we kick off a new open.
  const cooldownUntil = useRef(0);
  const wasUnfocused = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (wasUnfocused.current) {
        // Return from a pushed screen — the close animation is wrapping up.
        cooldownUntil.current = Date.now() + 400;
      }
      return () => {
        wasUnfocused.current = true;
      };
    }, []),
  );

  const openRound = (args: {
    id: string;
    title: string;
    subtitle: string;
    meta: string;
    imageKey: ImageKey;
    description: string;
  }) => {
    if (Date.now() < cooldownUntil.current) return;
    cooldownUntil.current = Date.now() + 600;

    const zoomId = `round-${args.id}`;
    armZoomTransition(zoomId);
    router.push({
      pathname: "/ui-preview/playlist/[id]",
      params: {
        id: args.id,
        title: args.title,
        subtitle: args.subtitle,
        meta: args.meta,
        imageKey: args.imageKey,
        description: args.description,
      },
    });
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Header ── */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.leagueTag}>Ghost Mall FM</Text>
              <Text style={styles.pageTitle}>Home</Text>
            </View>
            <View style={styles.avatarStack}>
              {PLAYERS.map((p, i) => (
                <View
                  key={p.n}
                  style={[
                    styles.avatar,
                    {
                      backgroundColor: p.c,
                      marginLeft: i ? -8 : 0,
                      zIndex: PLAYERS.length - i,
                    },
                  ]}
                >
                  <Text style={styles.avatarInitial}>{p.n[0]}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── Hero: active round ── */}
          <View style={styles.heroMeta}>
            <Text style={styles.liveLabel}>Live round · vote open</Text>
            <Text style={styles.heroPrompt}>{ACTIVE.prompt}.</Text>
            <Text style={styles.heroDescriptor}>{ACTIVE.descriptor}</Text>
          </View>

          <Pressable
            style={styles.heroImageWrap}
            onPress={() =>
              openRound({
                id: "active",
                title: ACTIVE.prompt,
                subtitle: ACTIVE.descriptor,
                meta: ACTIVE.phase,
                imageKey: ACTIVE.imageKey,
                description:
                  "Round 05 of Winter Season. Twelve anonymous picks are in — your allocation decides who wins the round and who sits out of the next one. Voting closes in 1d 11h.",
              })
            }
          >
            <ZoomSource zoomSourceId="round-active" style={styles.heroZoom}>
              {/* contentPosition="top" anchors the cover-fit crop to the top
                  of the source image. Source images are authored as 1:2
                  portraits with the focal subject in the top 25%; the 16:10
                  tile crop (top 31% of a 1:2 source) therefore always shows
                  the focal in frame with a bit of breathing room below. */}
              <View style={styles.fill}>
                <Image
                  source={ROUND_IMAGES[ACTIVE.imageKey]}
                  style={styles.fill}
                  contentFit="cover"
                  contentPosition={{ top: ACTIVE_CARD_CROP_Y }}
                  transition={0}
                />
              </View>
            </ZoomSource>
            <View style={styles.liveBadge} pointerEvents="none">
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>Live</Text>
            </View>
            <View style={styles.heroImageFooter} pointerEvents="none">
              <Text style={styles.heroPhase}>{ACTIVE.phase}</Text>
              <Text style={styles.heroCta}>
                {ACTIVE.submitted} picks in · tap to vote →
              </Text>
            </View>
          </Pressable>

          {/* ── Playlist grid ── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your playlists</Text>
            <Text style={styles.sectionMeta}>
              {PLAYLISTS.length} · all seasons ›
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            // Snap a column at a time for a tactile feel. decelerationRate
            // "fast" keeps the swipe crisp; without it snap feels sluggish.
            decelerationRate="fast"
            snapToInterval={tileWidth + RAIL_GAP}
            snapToAlignment="start"
            contentContainerStyle={styles.railContent}
          >
            {columns.map((col, colIdx) => (
              <View
                key={`col-${colIdx}`}
                style={[styles.railColumn, { width: tileWidth }]}
              >
                {col.map((p) => {
                  const subtitle = `${p.season} Season · R${String(p.n).padStart(2, "0")}`;
                  return (
                    <Pressable
                      key={p.id}
                      style={styles.railItem}
                      onPress={() =>
                        openRound({
                          id: p.id,
                          title: p.prompt,
                          subtitle,
                          meta: `${p.tracks} picks · wrapped`,
                          imageKey: p.imageKey,
                          description:
                            "A completed round from your league. Tap play to hear every submitter's pick in order, or shuffle for a blind re-listen.",
                        })
                      }
                    >
                      <ZoomSource
                        zoomSourceId={`round-${p.id}`}
                        style={styles.gridArt}
                      >
                        <View style={styles.fill}>
                          <Image
                            source={ROUND_IMAGES[p.imageKey]}
                            style={styles.fill}
                            contentFit="cover"
                            contentPosition="top"
                            transition={0}
                          />
                        </View>
                      </ZoomSource>
                      <Text style={styles.gridPrompt} numberOfLines={2}>
                        {p.prompt}
                      </Text>
                      <Text style={styles.gridMeta} numberOfLines={1}>
                        {p.season} · R{String(p.n).padStart(2, "0")} ·{" "}
                        {p.tracks} tracks
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          {/* ── Seasons ── */}
          <View style={styles.seasonsSection}>
            <Text style={styles.seasonsLabel}>Seasons</Text>
            {SEASONS.map((s, i) => (
              <View
                key={s.id}
                style={[
                  styles.seasonRow,
                  i < SEASONS.length - 1 && styles.seasonRowBorder,
                ]}
              >
                <View
                  style={[
                    styles.seasonIcon,
                    { backgroundColor: s.active ? v1.accent : v1.ink },
                  ]}
                >
                  <Text style={styles.seasonIconLetter}>{s.name[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.seasonName}>{s.name}</Text>
                  <Text style={styles.seasonStatus}>
                    {s.active
                      ? `In progress · rank #${s.you.rank} · ${s.you.pts} pts`
                      : `Wrapped · ${s.champion} took it`}
                  </Text>
                </View>
                <Text style={styles.seasonArrow}>→</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* ── Floating chrome: now playing + tab bar ── */}
      <SafeAreaView
        style={styles.bottomChrome}
        edges={["bottom"]}
        pointerEvents="box-none"
      >
        <View style={{ gap: 8 }}>
          <NowPlayingBar
            title="Ribs"
            artist="Lorde"
            hue={200}
            dual={[160, 230]}
          />
          <TabBar active="home" />
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: v1.bg },
  scroll: { paddingBottom: 180 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 8,
  },
  leagueTag: {
    ...v1.text.homeLeagueTag,
  },
  pageTitle: {
    ...v1.text.homePageTitle,
    marginTop: 4,
  },
  avatarStack: { flexDirection: "row" },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: v1.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    ...v1.text.avatarInitial,
  },

  // Hero meta
  heroMeta: { paddingHorizontal: 22, paddingTop: 10 },
  liveLabel: {
    ...v1.text.homeLiveLabel,
  },
  heroPrompt: {
    ...v1.text.homeHeroPrompt,
    marginTop: 6,
  },
  heroDescriptor: {
    ...v1.text.homeHeroDescriptor,
    marginTop: 6,
  },

  // Hero image
  heroImageWrap: {
    // Mathematically centered (22 on each side). If the card reads as
    // left-leaning, that's the liveBadge + left-aligned heroMeta text above
    // biasing your eye — bump the left margin +1-2pt to optically center.
    marginLeft: 22,
    marginRight: 0,
    marginTop: 14,
    borderRadius: 22,
    overflow: "hidden",
    aspectRatio: 16 / 10,
    shadowColor: v1.ink,
    shadowOpacity: 0.16,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 14 },
  },
  heroZoom: { flex: 1 },
  heroImage: { flex: 1 },
  // Percentage-based fill — works inside either an RN View or an ExpoView.
  fill: { width: "100%", height: "100%" },
  liveBadge: {
    position: "absolute",
    top: 14,
    left: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: v1.accent,
  },
  liveBadgeText: {
    ...v1.text.liveBadgeText,
  },
  heroImageFooter: {
    position: "absolute",
    bottom: 14,
    left: 14,
    right: 14,
  },
  heroPhase: {
    ...v1.text.homeHeroPhase,
  },
  heroCta: {
    ...v1.text.homeHeroCta,
    marginTop: 4,
  },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 28,
  },
  sectionTitle: {
    ...v1.text.sectionTitle,
  },
  sectionMeta: {
    ...v1.text.sectionMeta,
  },

  // Playlist rail (horizontal scroller of 2-tall columns)
  railContent: {
    paddingHorizontal: RAIL_H_PADDING,
    paddingTop: 14,
    gap: RAIL_GAP,
  },
  railColumn: {
    // Two rows inside each column, evenly spaced.
    gap: RAIL_GAP,
  },
  railItem: {
    // Width comes from the column; letting the item fill keeps the tile
    // aligned with the column width whatever screen size we're on.
    width: "100%",
  },
  gridArt: {
    aspectRatio: 1,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: v1.ink,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  gridFill: { flex: 1 },
  gridPrompt: {
    ...v1.text.playlistTilePrompt,
    marginTop: 8,
  },
  gridMeta: {
    ...v1.text.playlistTileMeta,
    marginTop: 2,
  },

  // Seasons
  seasonsSection: {
    marginTop: 32,
    paddingHorizontal: 22,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: v1.rule,
  },
  seasonsLabel: {
    ...v1.text.seasonsLabel,
  },
  seasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  seasonRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: v1.rule,
  },
  seasonIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  seasonIconLetter: {
    ...v1.text.seasonIconLetter,
  },
  seasonName: {
    ...v1.text.seasonName,
  },
  seasonStatus: {
    ...v1.text.seasonStatus,
    marginTop: 2,
  },
  seasonArrow: {
    ...v1.text.seasonArrow,
  },

  // Bottom chrome
  bottomChrome: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: 6,
  },
});
