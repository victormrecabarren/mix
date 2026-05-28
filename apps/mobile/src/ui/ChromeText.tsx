// Chrome-looking Unicode glyph (★ ✦ ♥ + etc.).
//
// MaskedView clips a LinearGradient to the shape of a Text element. We size
// the MaskedView explicitly so neither the mask nor the gradient depends on
// intrinsic text measurement (which produced rendering artifacts — phantom
// characters, transparent fill — in the previous "invisible sizer text"
// approach).
//
// Gradient stops mirror Claude Design's chrome spec:
//   linear-gradient(135deg,
//     #f5f5f5 0%, #d0d0d0 25%, #ffffff 45%, #b0b0b0 60%, #e8e8e8 80%, #c8c8c8 100%);

import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";

export type ChromeGlyphProps = {
  glyph: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

const CHROME_COLORS = [
  "#f5f5f5",
  "#d0d0d0",
  "#ffffff",
  "#b0b0b0",
  "#e8e8e8",
  "#c8c8c8",
] as const;
const CHROME_LOCATIONS = [0, 0.25, 0.45, 0.6, 0.8, 1] as const;

export function ChromeText({ glyph, size = 24, style }: ChromeGlyphProps) {
  // The mask glyph needs a generous bounding box so descenders / wide glyphs
  // (★ has the same width as height; ✦ slightly wider) don't clip. 1.2× is a
  // safe envelope that still hugs the character visually.
  const boxW = Math.round(size * 1.2);
  const boxH = Math.round(size * 1.2);

  return (
    <MaskedView
      style={[{ width: boxW, height: boxH }, style]}
      maskElement={
        <View style={styles.maskWrap}>
          <Text
            style={[styles.maskText, { fontSize: size, lineHeight: size }]}
            allowFontScaling={false}
            numberOfLines={1}
          >
            {glyph}
          </Text>
        </View>
      }
    >
      <LinearGradient
        colors={CHROME_COLORS as unknown as [string, string, ...string[]]}
        locations={CHROME_LOCATIONS as unknown as [number, number, ...number[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  maskWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  maskText: {
    color: "#000",
    backgroundColor: "transparent",
    textAlign: "center",
    // Reset any inherited italic from a parent <Text>; chrome should be
    // upright unless caller explicitly opts in via `style`.
    fontStyle: "normal",
    fontWeight: "400",
  },
});
