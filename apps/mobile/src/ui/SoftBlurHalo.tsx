// A blur view whose edges fade to nothing instead of clipping in a square.
//
// Built by masking an expo-blur BlurView with an SVG radial gradient (opaque
// center → transparent edge). The result reads like a soft "halo" of frosted
// glass — no perceptible bounding box, no rounded-corner artifacts.
//
// Tuneable knobs:
//   intensity        — 0..100, expo-blur strength
//   coreStop         — 0..1, where the alpha starts falling off (closer to 1
//                       gives a tighter, more opaque core; closer to 0 fades
//                       almost immediately)
//   coreOpacity      — peak alpha at center (1 = fully blurred core)

import { useId } from "react";
import { StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

export type SoftBlurHaloProps = {
  intensity?: number;
  tint?: "light" | "dark" | "default";
  coreStop?: number;
  coreOpacity?: number;
};

export function SoftBlurHalo({
  intensity = 32,
  tint = "light",
  coreStop = 0.45,
  coreOpacity = 1,
}: SoftBlurHaloProps) {
  // useId keeps the gradient id unique when multiple halos mount.
  const gradId = `softblur-${useId().replace(/[:]/g, "")}`;

  return (
    <MaskedView
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      maskElement={
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient
              id={gradId}
              cx="50%"
              cy="50%"
              rx="50%"
              ry="50%"
              fx="50%"
              fy="50%"
            >
              <Stop offset="0" stopColor="#fff" stopOpacity={coreOpacity} />
              <Stop offset={`${coreStop}`} stopColor="#fff" stopOpacity={coreOpacity * 0.85} />
              <Stop offset="1" stopColor="#fff" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${gradId})`} />
        </Svg>
      }
    >
      <BlurView
        intensity={intensity}
        tint={tint}
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
    </MaskedView>
  );
}
