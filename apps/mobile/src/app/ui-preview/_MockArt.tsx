// TEMP: shared decorative "cover art" for the preview. Used inside ZoomSource
// tiles AND the destination hero so we can visually judge whether iOS's
// .zoom transition preserves the image through the animation.
//
// Filename prefixed with `_` so expo-router treats it as a private module
// (not a route). Delete when the ui-preview experiment is removed.

import { StyleSheet, Text, View } from "react-native";

export function MockArt({ color, label }: { color: string; label: string }) {
  const letter = (label[0] ?? "?").toUpperCase();
  return (
    <View style={[styles.root, { backgroundColor: color }]}>
      {/* Offset decorative shapes — intentionally positioned so they remain
          recognizable at both tile-size and hero-size. */}
      <View style={styles.topLeftCircle} />
      <View style={styles.bottomRightCircle} />
      <View style={styles.diagonalBar} />
      <Text style={styles.letter}>{letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  topLeftCircle: {
    position: "absolute",
    top: "-15%",
    left: "-10%",
    width: "55%",
    aspectRatio: 1,
    borderRadius: 9999,
    backgroundColor: "#ffffff26",
  },
  bottomRightCircle: {
    position: "absolute",
    bottom: "-25%",
    right: "-20%",
    width: "75%",
    aspectRatio: 1,
    borderRadius: 9999,
    backgroundColor: "#00000040",
  },
  diagonalBar: {
    position: "absolute",
    top: "50%",
    left: "-10%",
    right: "-10%",
    height: 3,
    backgroundColor: "#ffffff33",
    transform: [{ rotate: "-18deg" }],
  },
  letter: {
    fontSize: 64,
    fontWeight: "900",
    color: "#fff",
    textShadowColor: "#00000055",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
});
