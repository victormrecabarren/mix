// Hue-driven playlist/round cover art, purely layout-level.
// The web design uses a generated halftone SVG — in RN we approximate that
// visual feel with a base color + a bright outer ring + a darker inner core,
// composed from plain Views. Close enough to gauge layout; can swap in a
// real SVG pattern later if needed.

import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

export type CoverArtPattern = "halftone" | "spiral" | "grid";

export function CoverArt({
  hue,
  dual,
  pattern: _pattern = "halftone",
  style,
}: {
  hue: number;
  dual?: readonly [number, number];
  pattern?: CoverArtPattern;
  style?: StyleProp<ViewStyle>;
}) {
  const h1 = dual ? dual[0] : hue;
  const h2 = dual ? dual[1] : hue;
  return (
    <View
      style={[
        styles.root,
        { backgroundColor: `hsl(${h2}, 78%, 48%)` },
        style,
      ]}
    >
      {/* Bright ring — simulates the halftone sphere's outer glow. */}
      <View
        style={[
          styles.ring,
          { backgroundColor: `hsla(${h1}, 90%, 86%, 0.55)` },
        ]}
      />
      {/* Inner darker core */}
      <View
        style={[
          styles.core,
          { backgroundColor: `hsla(${h2}, 70%, 22%, 0.55)` },
        ]}
      />
      {/* Highlight spot — top-left bias, matches the radial gradient origin */}
      <View
        style={[
          styles.highlight,
          { backgroundColor: `hsla(${h1}, 92%, 74%, 0.6)` },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: "hidden", alignItems: "center", justifyContent: "center" },
  ring: {
    position: "absolute",
    width: "90%",
    aspectRatio: 1,
    borderRadius: 9999,
  },
  core: {
    position: "absolute",
    width: "38%",
    aspectRatio: 1,
    borderRadius: 9999,
  },
  highlight: {
    position: "absolute",
    top: "12%",
    left: "14%",
    width: "45%",
    aspectRatio: 1,
    borderRadius: 9999,
    opacity: 0.9,
  },
});
