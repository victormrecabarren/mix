// Chrome ring around any rectangular container.
//
// Web spec uses `border: 1.5px solid transparent; background: linear-gradient
// (bg,bg) padding-box, conic-gradient(...) border-box`. RN has no conic
// gradient and no border-box clip, so we approximate the metal feel with a
// 135° LinearGradient acting as the outer container; an inset inner View
// clips the children with `radius - thickness`. Visually reads the same at
// 1.5px thickness.

import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const CHROME_COLORS = [
  "#f5f5f5",
  "#d0d0d0",
  "#ffffff",
  "#b0b0b0",
  "#e8e8e8",
  "#c8c8c8",
] as const;
const CHROME_LOCATIONS = [0, 0.25, 0.45, 0.6, 0.8, 1] as const;

export type ChromeBorderProps = {
  radius: number;
  thickness?: number;
  innerBg?: string;
  clip?: boolean;
  // Override the metal palette. Defaults to chrome silver; pass GOLD_STOPS
  // / BRONZE_STOPS (or any custom array) for variants like podium rings.
  // `colorLocations` is optional — if omitted, expo-linear-gradient evenly
  // distributes the stops.
  colors?: readonly string[];
  colorLocations?: readonly number[];
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export function ChromeBorder({
  radius,
  thickness = 1.5,
  innerBg,
  clip = false,
  colors,
  colorLocations,
  style,
  children,
}: ChromeBorderProps) {
  const innerRadius = Math.max(0, radius - thickness);
  const gradientColors = (colors ??
    CHROME_COLORS) as unknown as [string, string, ...string[]];
  const gradientLocations =
    colors !== undefined
      ? (colorLocations as unknown as
          | [number, number, ...number[]]
          | undefined)
      : (CHROME_LOCATIONS as unknown as [number, number, ...number[]]);
  return (
    <LinearGradient
      colors={gradientColors}
      locations={gradientLocations}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      // `overflow: hidden` on the outer gradient is what actually clips the
      // ring's corners on iOS — without it the LinearGradient paints a
      // rounded shape but anything inside (image, pressable, etc.) bleeds
      // out to square corners.
      style={[{ borderRadius: radius, padding: thickness, overflow: "hidden" }, style]}
    >
      <View
        style={[
          styles.inner,
          {
            borderRadius: innerRadius,
            backgroundColor: innerBg,
            overflow: clip ? "hidden" : "visible",
          },
        ]}
      >
        {children}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  inner: { flex: 1 },
});
