import { Dimensions, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Circle,
  Defs,
  Filter,
  FeGaussianBlur,
  RadialGradient,
  Stop,
} from "react-native-svg";
import { nocturne } from "@/theme/colors";

type Props = {
  /** Primary accent color (larger wash, top-right) */
  accentColor?: string;
  /** Secondary accent (smaller wash, mid-left) */
  secondaryColor?: string;
  children: React.ReactNode;
};

/**
 * Full-screen ambient background.
 * Dark vertical gradient base + SVG color blobs with real gaussian blur
 * via <feGaussianBlur>. Soft radial-gradient fills give smooth falloff.
 */
export function AmbientBackground({
  accentColor = nocturne.blueLight,
  secondaryColor = nocturne.blue,
  children,
}: Props) {
  const { width: screenW, height: screenH } = Dimensions.get("window");

  return (
    <View style={styles.container}>
      {/* Dark base — bg2 at top, holding bg through most of the screen,
          only transitioning to pure black at the very bottom (behind the tab bar) */}
      <LinearGradient
        colors={[nocturne.bg2, nocturne.bg, "#000"]}
        locations={[0, 0.8, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* SVG blob canvas with real gaussian blur */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width={screenW} height={screenH}>
          <Defs>
            <Filter
              id="heavyBlur"
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
            >
              <FeGaussianBlur stdDeviation="60" />
            </Filter>
            <RadialGradient id="accentGrad" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={accentColor} stopOpacity={0.9} />
              <Stop offset="70%" stopColor={accentColor} stopOpacity={0.2} />
              <Stop offset="100%" stopColor={accentColor} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="secondaryGrad" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={secondaryColor} stopOpacity={0.9} />
              <Stop
                offset="70%"
                stopColor={secondaryColor}
                stopOpacity={0.2}
              />
              <Stop offset="100%" stopColor={secondaryColor} stopOpacity={0} />
            </RadialGradient>
          </Defs>

          {/* Primary blob — upper-right, partially offscreen */}
          <Circle
            cx={screenW * 0.78}
            cy={screenH * 0.18}
            r={160}
            fill="url(#accentGrad)"
            filter="url(#heavyBlur)"
          />

          {/* Secondary blob — mid-left, smaller */}
          <Circle
            cx={screenW * 0.18}
            cy={screenH * 0.36}
            r={120}
            fill="url(#secondaryGrad)"
            filter="url(#heavyBlur)"
          />
        </Svg>
      </View>

      {/* Content */}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
    backgroundColor: "#000",
    overflow: "hidden",
  },
  content: {
    flex: 1,
  },
});
