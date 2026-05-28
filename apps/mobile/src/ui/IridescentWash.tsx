// Iridescent oil-slick wash background — three stacked radial gradients
// painting pink (top-left) → cyan (upper-right) → lilac (base). Lifted from
// Claude Design's "Liquid · Lilac" / Theme C spec.
//
// CSS source order is top-to-bottom (first = on top). SVG paints in document
// order (first = on bottom). So we reverse the layer list when emitting
// the <Rect> fills below.

import { StyleSheet, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

export function IridescentWash() {
  return (
    <View style={styles.root} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          {/* Base lilac wash — opaque end-to-end. */}
          <RadialGradient
            id="iride-base"
            cx="50%"
            cy="120%"
            rx="140%"
            ry="100%"
            fx="50%"
            fy="120%"
          >
            <Stop offset="0" stopColor="#E8D5FF" stopOpacity={1} />
            <Stop offset="0.5" stopColor="#EDD7FF" stopOpacity={1} />
            <Stop offset="1" stopColor="#F5E3FF" stopOpacity={1} />
          </RadialGradient>

          {/* Cyan bloom — upper-right. */}
          <RadialGradient
            id="iride-cyan"
            cx="100%"
            cy="20%"
            rx="100%"
            ry="80%"
            fx="100%"
            fy="20%"
          >
            <Stop offset="0" stopColor="#D9F1FF" stopOpacity={1} />
            <Stop offset="0.55" stopColor="#D9F1FF" stopOpacity={0} />
          </RadialGradient>

          {/* Pink bloom — top-left. */}
          <RadialGradient
            id="iride-pink"
            cx="20%"
            cy="0%"
            rx="120%"
            ry="80%"
            fx="20%"
            fy="0%"
          >
            <Stop offset="0" stopColor="#FFE1F5" stopOpacity={1} />
            <Stop offset="0.6" stopColor="#FFE1F5" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Paint base first, then blooms on top. */}
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#iride-base)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#iride-cyan)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#iride-pink)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject },
});
