// TEMP: V1 · Archive home — warm editorial minimalism.
// Direct layout port of `directions/v1-archive.jsx > aHome` from the
// Claude Design handoff. Data is placeholder, matched to the prototype's
// shared fixtures (playlist-shared.jsx).
//
// Now Playing + Tab Bar live in sibling private files — they're scoped to
// the preview for now but factored so they can graduate into the real app
// when the design direction is locked in.
//
// As of Phase 4 of the UI migration the visual primitives (page header,
// hero card, playlist rail, seasons list, section header, avatar stack)
// are extracted into `@/ui/*`. This file stays as the design playground
// driving them with placeholder data.

import { useCallback, useRef } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { armZoomTransition } from "native-zoom";
import { NowPlayingBar } from "./_NowPlayingBar";
import { TabBar } from "./_TabBar";
import { type ImageKey } from "./_images";
import { v1 } from "./_tokens";
import { PageHeader } from "@/ui/PageHeader";
import { SectionHeader } from "@/ui/sections/SectionHeader";
import { SeasonsList } from "@/ui/sections/SeasonsList";
import { HeroRoundCard } from "@/ui/cards/HeroRoundCard";
import { PlaylistRail } from "@/ui/cards/PlaylistRail";

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

const SEASONS: Array<{
  id: string;
  name: string;
  status: "active" | "completed";
  you?: { rank: number; points: number };
  championName?: string;
}> = [
  {
    id: "s2",
    name: "Winter Season",
    status: "active",
    you: { rank: 7, points: 58 },
  },
  {
    id: "s1",
    name: "First Season",
    status: "completed",
    you: { rank: 4, points: 142 },
    championName: "Jules",
  },
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
          <PageHeader
            leagueTag="Ghost Mall FM"
            title="Home"
          />

          <HeroRoundCard
            prompt={ACTIVE.prompt}
            descriptor={ACTIVE.descriptor}
            phaseLabel={ACTIVE.phase}
            ctaLabel={`${ACTIVE.submitted} picks in · tap to vote →`}
            status="live"
            imageKey={ACTIVE.imageKey}
            zoomSourceId="round-active"
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
          />

          <SectionHeader
            title="Your playlists"
            count={PLAYLISTS.length}
            trailingLabel="all seasons"
          />
          <PlaylistRail
            items={PLAYLISTS.map((p) => {
              const subtitle = `${p.season} Season · R${String(p.n).padStart(2, "0")}`;
              return {
                id: p.id,
                prompt: p.prompt,
                meta: `${p.season} · R${String(p.n).padStart(2, "0")} · ${p.tracks} tracks`,
                imageKey: p.imageKey,
                zoomSourceId: `round-${p.id}`,
                onPress: () =>
                  openRound({
                    id: p.id,
                    title: p.prompt,
                    subtitle,
                    meta: `${p.tracks} picks · wrapped`,
                    imageKey: p.imageKey,
                    description:
                      "A completed round from your league. Tap play to hear every submitter's pick in order, or shuffle for a blind re-listen.",
                  }),
              };
            })}
          />

          <SeasonsList seasons={SEASONS} />
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

  // Bottom chrome
  bottomChrome: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: 6,
  },
});
