// TEMP: V1 · Archive home — warm editorial minimalism.
// Direct layout port of `directions/v1-archive.jsx > aHome` from the
// Claude Design handoff. Data is placeholder, matched to the prototype's
// shared fixtures (playlist-shared.jsx).
//
// Now Playing + Tab Bar live in sibling private files — they're scoped to
// the preview for now but factored so they can graduate into the real app
// when the design direction is locked in.

import { useCallback, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
    prompt: "Something your parents would hate",
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
          <View style={styles.grid}>
            {PLAYLISTS.map((p) => {
              const subtitle = `${p.season} Season · R${String(p.n).padStart(2, "0")}`;
              return (
                <Pressable
                  key={p.id}
                  style={styles.gridItem}
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
                    {p.season} · R{String(p.n).padStart(2, "0")} · {p.tracks}{" "}
                    tracks
                  </Text>
                </Pressable>
              );
            })}
          </View>

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
    fontFamily: v1.fonts.serifItalic,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: v1.muted,
  },
  pageTitle: {
    fontFamily: v1.fonts.sansBold,
    fontSize: 34,
    letterSpacing: -1.2,
    color: v1.ink,
    marginTop: 4,
    lineHeight: 36,
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
    fontFamily: v1.fonts.sansBold,
    fontSize: 11,
    color: "#fff",
  },

  // Hero meta
  heroMeta: { paddingHorizontal: 22, paddingTop: 10 },
  liveLabel: {
    fontFamily: v1.fonts.sansBold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: v1.accent,
  },
  heroPrompt: {
    fontFamily: v1.fonts.serifItalic,
    fontSize: 32,
    letterSpacing: -0.6,
    lineHeight: 34,
    color: v1.ink,
    marginTop: 6,
  },
  heroDescriptor: {
    fontFamily: v1.fonts.sansMedium,
    fontSize: 12,
    color: v1.muted,
    marginTop: 6,
  },

  // Hero image
  heroImageWrap: {
    marginHorizontal: 22,
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
    fontFamily: v1.fonts.sansBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: v1.ink,
  },
  heroImageFooter: {
    position: "absolute",
    bottom: 14,
    left: 14,
    right: 14,
  },
  heroPhase: {
    fontFamily: v1.fonts.sansSemi,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.9)",
  },
  heroCta: {
    fontFamily: v1.fonts.serifMedium,
    fontSize: 20,
    lineHeight: 22,
    letterSpacing: -0.3,
    color: "#fff",
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
    fontFamily: v1.fonts.sansBold,
    fontSize: 22,
    letterSpacing: -0.6,
    color: v1.ink,
  },
  sectionMeta: {
    fontFamily: v1.fonts.sansMedium,
    fontSize: 12,
    color: v1.muted,
  },

  // Grid
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 22,
    paddingTop: 14,
    gap: 12,
  },
  gridItem: {
    width: "48%",
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
    fontFamily: v1.fonts.serifMedium,
    fontSize: 14,
    lineHeight: 17,
    letterSpacing: -0.1,
    color: v1.ink,
    marginTop: 8,
  },
  gridMeta: {
    fontFamily: v1.fonts.sansMedium,
    fontSize: 11,
    color: v1.muted,
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
    fontFamily: v1.fonts.sansBold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: v1.muted,
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
    fontFamily: v1.fonts.serifMediumItalic,
    fontSize: 18,
    color: "#fff",
  },
  seasonName: {
    fontFamily: v1.fonts.sansSemi,
    fontSize: 15,
    color: v1.ink,
  },
  seasonStatus: {
    fontFamily: v1.fonts.sansMedium,
    fontSize: 11,
    color: v1.muted,
    marginTop: 2,
  },
  seasonArrow: {
    fontFamily: v1.fonts.serifItalic,
    fontSize: 18,
    color: v1.faint,
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
