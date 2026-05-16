// TEMP: Apple Music–style floating mini-player pill.
//
// Targets the "expanded" state shown in the reference screenshot: it sits
// just above the tab bar, pill-shaped with a frosted glass backdrop, artwork
// on the left, track + artist in the middle, Play + Next icons on the right.
//
// The collapsed-on-scroll variant (smaller pill that tucks into the top
// navigation) is intentionally out of scope for this pass — we'll revisit
// it as its own component when we wire real playback state.

import { BlurView } from "expo-blur";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CoverArt } from "./_CoverArt";
import { v1 } from "./_tokens";

export function NowPlayingBar({
  title,
  artist,
  hue,
  dual,
}: {
  title: string;
  artist: string;
  hue: number;
  dual?: readonly [number, number];
}) {
  return (
    <View style={styles.wrap}>
      <BlurView intensity={55} tint="light" style={styles.pill}>
        <View style={styles.pillInner}>
          <CoverArt hue={hue} dual={dual} style={styles.art} />
          <View style={styles.meta}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {artist}
            </Text>
          </View>
          <Pressable style={styles.iconBtn} hitSlop={8}>
            {/* Play triangle */}
            <View style={styles.playTriangle} />
          </Pressable>
          <Pressable style={styles.iconBtn} hitSlop={8}>
            {/* Next / fast-forward — two triangles */}
            <View style={styles.skipRow}>
              <View style={styles.skipTriangle} />
              <View style={[styles.skipTriangle, { marginLeft: 2 }]} />
            </View>
          </Pressable>
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 10 },
  pill: {
    borderRadius: 32,
    overflow: "hidden",
    // Very light glass edge that picks up on bright backgrounds.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(11,11,11,0.06)",
  },
  pillInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(246,241,232,0.55)",
  },
  art: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  meta: { flex: 1, minWidth: 0 },
  title: {
    ...v1.text.nowPlayingTitle,
  },
  artist: {
    ...v1.text.nowPlayingArtist,
    marginTop: 1,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  // CSS-only triangle for Play icon (rotated 90° so it points right).
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 9,
    borderBottomWidth: 9,
    borderLeftWidth: 14,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: v1.ink,
    marginLeft: 2,
  },
  skipRow: { flexDirection: "row", alignItems: "center" },
  skipTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftWidth: 11,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: v1.ink,
  },
});
