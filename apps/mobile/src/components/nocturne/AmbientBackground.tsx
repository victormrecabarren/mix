import { useEffect, useRef, useState } from "react";
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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { nocturne } from "@/theme/colors";

type Props = {
  /** Primary accent color (larger wash, top-right) */
  accentColor?: string;
  /** Secondary accent (smaller wash, mid-left) */
  secondaryColor?: string;
  /** Fade duration when colors change (ms) */
  fadeDuration?: number;
  children: React.ReactNode;
};

type ColorSet = { accent: string; secondary: string };

/**
 * Full-screen ambient background.
 * Dark vertical gradient base + SVG color blobs with real gaussian blur.
 * When the color props change, the previous palette cross-fades out while
 * the new palette cross-fades in — gives pages distinct ambient moods without
 * ever showing a pure-black gap between them.
 */
export function AmbientBackground({
  accentColor = nocturne.blueLight,
  secondaryColor = nocturne.blue,
  fadeDuration = 700,
  children,
}: Props) {
  const { width: screenW, height: screenH } = Dimensions.get("window");

  const [currentColors, setCurrentColors] = useState<ColorSet>({
    accent: accentColor,
    secondary: secondaryColor,
  });
  const [prevColors, setPrevColors] = useState<ColorSet | null>(null);
  const newLayerOpacity = useSharedValue(1);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (
      accentColor === currentColors.accent &&
      secondaryColor === currentColors.secondary
    ) {
      return;
    }
    // Snapshot previous colors; start the new layer invisible and fade it in
    setPrevColors(currentColors);
    setCurrentColors({ accent: accentColor, secondary: secondaryColor });
    newLayerOpacity.value = 0;
    newLayerOpacity.value = withTiming(1, { duration: fadeDuration }, (finished) => {
      if (finished) {
        runOnJS(clearPrev)();
      }
    });
  }, [accentColor, secondaryColor]);

  const clearPrev = () => {
    if (isMounted.current) setPrevColors(null);
  };

  const newLayerStyle = useAnimatedStyle(() => ({
    opacity: newLayerOpacity.value,
  }));

  return (
    <View style={styles.container}>
      {/* Dark base gradient — constant across all screens */}
      <LinearGradient
        colors={[nocturne.bg2, nocturne.bg, "#000"]}
        locations={[0, 0.8, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Previous color layer — fades out as new layer fades in */}
      {prevColors && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <BlobCanvas
            accent={prevColors.accent}
            secondary={prevColors.secondary}
            width={screenW}
            height={screenH}
          />
        </View>
      )}

      {/* Current color layer — animated opacity */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, newLayerStyle]}
      >
        <BlobCanvas
          accent={currentColors.accent}
          secondary={currentColors.secondary}
          width={screenW}
          height={screenH}
        />
      </Animated.View>

      {/* Content */}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

function BlobCanvas({
  accent,
  secondary,
  width,
  height,
}: {
  accent: string;
  secondary: string;
  width: number;
  height: number;
}) {
  // Unique gradient IDs per color-set so multiple SVG instances don't collide
  const accentId = `accentGrad-${accent}`;
  const secondaryId = `secondaryGrad-${secondary}`;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <Filter id="heavyBlur" x="-50%" y="-50%" width="200%" height="200%">
          <FeGaussianBlur stdDeviation="60" />
        </Filter>
        <RadialGradient id={accentId} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={accent} stopOpacity={0.9} />
          <Stop offset="70%" stopColor={accent} stopOpacity={0.2} />
          <Stop offset="100%" stopColor={accent} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={secondaryId} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={secondary} stopOpacity={0.9} />
          <Stop offset="70%" stopColor={secondary} stopOpacity={0.2} />
          <Stop offset="100%" stopColor={secondary} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle
        cx={width * 0.78}
        cy={height * 0.18}
        r={160}
        fill={`url(#${accentId})`}
        filter="url(#heavyBlur)"
      />
      <Circle
        cx={width * 0.18}
        cy={height * 0.36}
        r={120}
        fill={`url(#${secondaryId})`}
        filter="url(#heavyBlur)"
      />
    </Svg>
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
