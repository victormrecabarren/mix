// Chrome-filled pill — polished metal across the whole button background
// (not just a ring around the edge like ChromeBorder). Pair with dark glyphs
// and labels for primary actions on saturated wallpapers.
//
// Gradient stops mirror Claude Design's chrome spec — same palette used by
// ChromeBorder and ChromeText so all three read as the same alloy.

import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Pressable, StyleSheet } from "react-native";
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

export type ChromeButtonProps = {
  onPress?: () => void;
  disabled?: boolean;
  children?: ReactNode;
  // Outer pill radius. Defaults to 26 (matches the play / shuffle buttons).
  radius?: number;
  // Vertical padding inside the pill. Default keeps the same hit area as
  // the dark-plum sibling buttons that pair with it.
  paddingVertical?: number;
  style?: StyleProp<ViewStyle>;
};

export function ChromeButton({
  onPress,
  disabled,
  children,
  radius = 26,
  paddingVertical = 13,
  style,
}: ChromeButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        { borderRadius: radius, overflow: "hidden" },
        disabled && { opacity: 0.5 },
        style,
      ]}
    >
      <LinearGradient
        colors={CHROME_COLORS as unknown as [string, string, ...string[]]}
        locations={CHROME_LOCATIONS as unknown as [number, number, ...number[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.fill, { paddingVertical }]}
      >
        {children}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});
