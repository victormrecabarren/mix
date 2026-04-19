// TEMP: preview playlist detail. Opened via the native-zoom module from the
// home grid. Placeholder content — this is where a real detail screen would
// wire into services (e.g. useRoundResults, useRound, useSeason).

import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { MockArt } from "../_MockArt";

export default function PlaylistDetail() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    title?: string;
    creator?: string;
    color?: string;
  }>();

  const title = params.title ?? "Playlist";
  const creator = params.creator ?? "Apple Music";
  const color = params.color ?? "#333";

  // Hero is 40% of the current screen height — big enough that the zoomed
  // tile lands on a full-size canvas and its artwork stays legible when
  // iOS completes the transition.
  const { height: screenHeight } = useWindowDimensions();
  const heroHeight = screenHeight * 0.4;

  return (
    <View style={styles.root}>
      <View style={[styles.hero, { height: heroHeight }]}>
        {/* Same MockArt the tile renders — the zoom is a simple scale, so
            matching content on both ends keeps the image continuous. */}
        <MockArt color={color} label={title} />
        {/* Text layered on top of the art, at the bottom-left — doesn't
            exist in the tile version, so it simply fades in as the
            destination arrives. */}
        <View style={styles.heroTextOverlay}>
          <Text style={styles.heroLabel}>PLAYLIST</Text>
          <Text style={styles.heroTitle}>{title}</Text>
          <Text style={styles.heroCreator}>{creator}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Pressable style={styles.playBtn} onPress={() => {}}>
          <Text style={styles.playBtnText}>▶  Play</Text>
        </Pressable>

        {[1, 2, 3, 4, 5, 6].map((n) => (
          <View key={n} style={styles.trackRow}>
            <View
              style={[styles.trackArt, { backgroundColor: color }]}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.trackTitle}>Track {n}</Text>
              <Text style={styles.trackArtist}>Artist name</Text>
            </View>
            <Text style={styles.trackMore}>···</Text>
          </View>
        ))}

        <Pressable style={styles.closeBtn} onPress={() => router.back()}>
          <Text style={styles.closeBtnText}>Close</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  hero: {
    overflow: "hidden",
  },
  heroTextOverlay: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 24,
    gap: 4,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ffffffcc",
    letterSpacing: 1,
  },
  heroTitle: { fontSize: 32, fontWeight: "900", color: "#fff" },
  heroCreator: { fontSize: 15, color: "#ffffffdd" },

  body: { padding: 16, gap: 12 },

  playBtn: {
    backgroundColor: "#f2f2f2",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  playBtnText: { fontSize: 16, fontWeight: "700", color: "#000" },

  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  trackArt: { width: 44, height: 44, borderRadius: 6 },
  trackTitle: { fontSize: 15, fontWeight: "600", color: "#000" },
  trackArtist: { fontSize: 13, color: "#888" },
  trackMore: { fontSize: 20, color: "#888" },

  closeBtn: {
    marginTop: 24,
    padding: 14,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  closeBtnText: { fontSize: 15, color: "#888", fontWeight: "600" },
});
