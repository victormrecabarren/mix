// Dual-layer radial-fade halo backdrop for text (or any content) on a busy
// or saturated background. A drop-in wrapper: put your <Text> inside, get a
// soft frosted readability boost with no perceptible card edge.
//
// Architecture
// ────────────
// - Outer layer: wide spill (-45%), gentle blur (intensity 18), gradual
//   falloff. The ambient smudge that extends well beyond the text.
// - Inner layer: tight spill (-20%), strong blur (intensity 52), sharp
//   falloff. Concentrated directly behind the type.
//
// Stacking them produces a *tapering blur strength* — not just a masked
// uniform blur. That's why it reads as a soft halo and not a clipped pill.
// Knobs are exposed so callers can tune for label size / background chroma.
//
// IMPORTANT — sibling z-order
// ────────────────────────────
// The halo's negative insets let it spill past the wrapping container into
// areas where sibling elements live. The BlurView samples whatever was
// painted before it in screen z-order, so any sibling rendered *underneath*
// the halo will get blurred along with the wallpaper.
//
// Fix: raise sibling text above the halo with `zIndex: 1` (or higher). The
// blur then only captures the wallpaper; sibling text paints crisply on top.
// Keep the HaloText itself at default zIndex — don't elevate it.

import type { ReactNode } from "react";
import type { DimensionValue, StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";
import { SoftBlurHalo } from "@/ui/SoftBlurHalo";

export type HaloTextProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  outerIntensity?: number;
  innerIntensity?: number;
  outerInset?: DimensionValue;
  innerInset?: DimensionValue;
  outerCoreStop?: number;
  innerCoreStop?: number;
  outerCoreOpacity?: number;
  innerCoreOpacity?: number;
  tint?: "light" | "dark" | "default";
};

export function HaloText({
  children,
  style,
  outerIntensity = 18,
  innerIntensity = 52,
  outerInset = "-45%",
  innerInset = "-20%",
  outerCoreStop = 0.6,
  innerCoreStop = 0.35,
  outerCoreOpacity = 0.85,
  innerCoreOpacity = 1,
  tint = "light",
}: HaloTextProps) {
  return (
    <View style={[style, { overflow: 'visible' }]}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: outerInset,
          bottom: outerInset,
          left: outerInset,
          right: outerInset,
        }}
      >
        <SoftBlurHalo
          intensity={outerIntensity}
          tint={tint}
          coreStop={outerCoreStop}
          coreOpacity={outerCoreOpacity}
        />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: innerInset,
          bottom: innerInset,
          left: innerInset,
          right: innerInset,
        }}
      >
        <SoftBlurHalo
          intensity={innerIntensity}
          tint={tint}
          coreStop={innerCoreStop}
          coreOpacity={innerCoreOpacity}
        />
      </View>
      {children}
    </View>
  );
}
