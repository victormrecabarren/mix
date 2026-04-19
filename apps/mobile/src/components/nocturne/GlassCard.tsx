import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { nocturne } from "@/theme/colors";

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Override blur intensity (default 20) */
  blur?: number;
};

/**
 * Frosted glass card with backdrop blur, subtle border, and rounded corners.
 */
export function GlassCard({ children, style, blur = 20 }: Props) {
  return (
    <View style={[styles.outer, style]}>
      <BlurView
        intensity={blur}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    borderRadius: nocturne.cardRadius,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: nocturne.cardBorder,
    backgroundColor: nocturne.card,
  },
  inner: {
    padding: 18,
    position: "relative",
  },
});
