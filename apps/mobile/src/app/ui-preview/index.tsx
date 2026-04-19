// TEMP: Apple Music–style preview home. Delete this folder when done
// experimenting. Demonstrates two things at once:
//   (1) A lightweight UI layer that talks to the services layer via hooks —
//       proving the decomposition lets us swap UI without touching business
//       logic. `useMyLeagues` + `useSession` are imported exactly like a
//       production screen would.
//   (2) Two navigation shapes: push/pop (category cards) and native sheet
//       presentation (playlist tiles).

import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useMyLeagues } from "@/queries/useMyLeagues";
import { useSession } from "@/context/SessionContext";
import { ZoomSource, armZoomTransition } from "native-zoom";
import { MockArt } from "./_MockArt";

// ─── Dummy content ────────────────────────────────────────────────────────────
// Placeholder data for the visual experiment. When the real screen ships,
// swap these for `useSeasonsForLeague` / `useRoundsForSeason` / etc. —
// already available in @/queries.

const FEATURED = [
  {
    id: "a-list",
    subtitle: "UPDATED PLAYLIST",
    title: "A-List Pop",
    creator: "Apple Music Pop",
    color: "#ff2d87",
  },
  {
    id: "todays-hits",
    subtitle: "UPDATED PLAYLIST",
    title: "Today's Hits",
    creator: "Apple Music",
    color: "#c89b2a",
  },
];

const PLAYLISTS = [
  { id: "hot-hits", title: "Hot Hits", creator: "Apple Music", color: "#f6d73a" },
  { id: "new-in-pop", title: "New in Pop", creator: "Apple Music Pop", color: "#c248ff" },
  { id: "viral-pop", title: "Viral Pop", creator: "Apple Music", color: "#ff4779" },
  { id: "mellow-pop", title: "Mellow Pop", creator: "Apple Music", color: "#f7a54a" },
  { id: "dreams", title: "Dreams", creator: "Apple Music", color: "#1f1f1f" },
  { id: "rising", title: "Rising", creator: "Apple Music", color: "#5c6bc0" },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function UiPreviewHome() {
  const router = useRouter();
  const { session } = useSession();

  // Live call into the services layer — this is the "verification" that
  // our decomposed layer is usable from a brand-new UI without any plumbing.
  const { data: myLeagues = [] } = useMyLeagues(session?.id);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]}>
        <View style={styles.topBar}>
          <Pressable
            style={styles.circleBtn}
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Text style={styles.circleBtnText}>‹</Text>
          </Pressable>
          <Pressable style={styles.circleBtn} hitSlop={12}>
            <Text style={styles.circleBtnDots}>···</Text>
          </Pressable>
        </View>

        <Text style={styles.pageTitle}>Pop</Text>
      </SafeAreaView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Featured horizontal cards — push/pop transition. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.featuredRow}
        >
          {FEATURED.map((card) => (
            <Pressable
              key={card.id}
              onPress={() =>
                router.push({
                  pathname: "/ui-preview/category/[id]",
                  params: { id: card.id },
                })
              }
              style={styles.featuredCardWrap}
            >
              <Text style={styles.featuredSubtitle}>{card.subtitle}</Text>
              <Text style={styles.featuredTitle}>{card.title}</Text>
              <Text style={styles.featuredCreator}>{card.creator}</Text>
              <View
                style={[styles.featuredArt, { backgroundColor: card.color }]}
              >
                <Text style={styles.featuredArtLabel}>{card.title}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>

        {/* Section: Playlists — tap any tile to open the native sheet. */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Playlists</Text>
          <Text style={styles.sectionChevron}>›</Text>
        </View>

        <View style={styles.grid}>
          {PLAYLISTS.map((p) => {
            // Each tile gets its own zoom id so the native registry can
            // resolve the exact tapped tile. Reusing a single shared id
            // meant the last-mounted tile overwrote everyone else.
            const zoomId = `playlist-${p.id}`;
            return (
              <Pressable
                key={p.id}
                onPress={() => {
                  // Arm the native module with this tile's id, then push —
                  // the module swizzles the next UINavigationController push
                  // to set preferredTransition = .zoom on iOS 18+.
                  armZoomTransition(zoomId);
                  router.push({
                    pathname: "/ui-preview/playlist/[id]",
                    params: { id: p.id, title: p.title, creator: p.creator, color: p.color },
                  });
                }}
                style={styles.gridItem}
              >
                <ZoomSource zoomSourceId={zoomId} style={styles.gridArt}>
                  <MockArt color={p.color} label={p.title} />
                </ZoomSource>
                <Text style={styles.gridTitle} numberOfLines={1}>
                  {p.title}
                </Text>
                <Text style={styles.gridCreator} numberOfLines={1}>
                  {p.creator}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Services-layer smoke test: displays the caller's real leagues
            (if signed in). Empty list if anonymous. This is the evidence
            that the new UI can call into the refactored services with no
            UI-specific plumbing. */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your leagues (live data)</Text>
        </View>
        <View style={{ paddingHorizontal: 20, gap: 8 }}>
          {myLeagues.length === 0 ? (
            <Text style={styles.emptyLine}>
              No leagues yet — sign in via the real app, then revisit this
              preview to see your data load through the services layer.
            </Text>
          ) : (
            myLeagues.map((l) => (
              <View key={l.id} style={styles.leagueChip}>
                <Text style={styles.leagueChipName}>{l.name}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  circleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f2f2f2",
    alignItems: "center",
    justifyContent: "center",
  },
  circleBtnText: { fontSize: 22, color: "#000", marginTop: -2 },
  circleBtnDots: { fontSize: 18, color: "#000", marginTop: -6 },

  pageTitle: {
    fontSize: 42,
    fontWeight: "800",
    color: "#000",
    paddingHorizontal: 20,
    paddingTop: 12,
  },

  scrollContent: { paddingBottom: 120 },

  featuredRow: { paddingHorizontal: 20, paddingVertical: 16, gap: 12 },
  featuredCardWrap: { width: 320 },
  featuredSubtitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#888",
    letterSpacing: 0.8,
  },
  featuredTitle: { fontSize: 20, fontWeight: "700", color: "#000", marginTop: 2 },
  featuredCreator: { fontSize: 14, color: "#888", marginBottom: 10 },
  featuredArt: {
    height: 220,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  featuredArtLabel: {
    fontSize: 28,
    fontWeight: "900",
    color: "#fff",
    textAlign: "center",
    paddingHorizontal: 16,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 6,
  },
  sectionTitle: { fontSize: 26, fontWeight: "800", color: "#000" },
  sectionChevron: { fontSize: 26, color: "#000" },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    gap: 8,
  },
  gridItem: {
    width: "31%",
    marginHorizontal: "1%",
    marginBottom: 12,
  },
  gridArt: {
    aspectRatio: 1,
    borderRadius: 8,
    marginBottom: 6,
  },
  gridTitle: { fontSize: 14, fontWeight: "700", color: "#000" },
  gridCreator: { fontSize: 12, color: "#888" },

  emptyLine: { fontSize: 13, color: "#888", lineHeight: 18 },
  leagueChip: {
    backgroundColor: "#f2f2f2",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  leagueChipName: { fontSize: 15, fontWeight: "600", color: "#000" },
});
