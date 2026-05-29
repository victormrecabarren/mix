// Reusable "glass" surface for floating chrome (pills, cards, tab bars,
// overlays). Picks the best available backend at runtime and degrades
// gracefully so callers never branch on platform:
//
//   iOS 26+         → real Liquid Glass (UIGlassEffect) via expo-glass-effect
//   iOS < 26        → expo-blur BlurView (systemUltraThinMaterialLight)
//   Android / web   → expo-blur BlurView (light)
//
// The fallback path is intentionally identical to the hand-tuned pill blur
// we shipped before adopting Liquid Glass, so nothing regresses on devices
// that can't render real glass.
//
// Usage — wrap any view and pass the surface shape (radius/border) via style:
//
//   <GlassSurface style={{ borderRadius: 30, overflow: "hidden" }}>
//     {children}
//   </GlassSurface>

import { BlurView, type BlurTint } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import type { GlassColorScheme, GlassStyle } from "expo-glass-effect";
import { Platform, type StyleProp, type ViewStyle } from "react-native";
import type { ReactNode } from "react";

export interface GlassSurfaceProps {
  children?: ReactNode;
  /**
   * Surface shape and layout. Put borderRadius / borderWidth / overflow here;
   * it is applied to whichever backend renders.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * Liquid Glass style on iOS 26+. `"clear"` is more transparent, `"regular"`
   * is the standard frosted look. Ignored on the blur fallback.
   * @default "regular"
   */
  glassEffectStyle?: GlassStyle;
  /**
   * Optional tint applied to the Liquid Glass material on iOS 26+.
   */
  tintColor?: string;
  /**
   * Whether the Liquid Glass reacts to touch (subtle bend/highlight).
   * iOS 26+ only; ignored on the fallback.
   * @default false
   */
  interactive?: boolean;
  /**
   * Forces the glass appearance instead of following the device's system
   * appearance. mix is a light-themed app and never honors system dark mode,
   * so we default to `"light"` — otherwise a phone in dark mode renders the
   * glass dark/murky under the app's light content. iOS 26+ only.
   * @default "light"
   */
  colorScheme?: GlassColorScheme;
  /**
   * Blur strength (1–100) for the BlurView fallback (iOS < 26, Android, web).
   * @default 80
   */
  fallbackBlurIntensity?: number;
  /**
   * Blur material/tint for the BlurView fallback. Defaults to the most
   * transparent system material on iOS and `"light"` elsewhere.
   */
  fallbackBlurTint?: BlurTint;
}

/** Stable per app launch — Liquid Glass availability doesn't change at runtime. */
const LIQUID_GLASS = isLiquidGlassAvailable();

export function GlassSurface({
  children,
  style,
  glassEffectStyle = "regular",
  tintColor,
  interactive = false,
  colorScheme = "light",
  fallbackBlurIntensity = 80,
  fallbackBlurTint,
}: GlassSurfaceProps) {
  if (LIQUID_GLASS) {
    return (
      <GlassView
        glassEffectStyle={glassEffectStyle}
        tintColor={tintColor}
        isInteractive={interactive}
        colorScheme={colorScheme}
        style={style}
      >
        {children}
      </GlassView>
    );
  }

  const tint: BlurTint =
    fallbackBlurTint ??
    (Platform.OS === "ios" ? "systemUltraThinMaterialLight" : "light");

  return (
    <BlurView intensity={fallbackBlurIntensity} tint={tint} style={style}>
      {children}
    </BlurView>
  );
}
