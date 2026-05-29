// Apple Music-style "now playing" overlay for an album art tile. Three
// staggered vertical bars over a dark scrim. Bars animate while playing and
// freeze at mid-height when paused. Pure presentational — caller decides
// when to render it.

import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { THEME } from "@/ui/theme/tokens";

interface BarConfig {
  duration: number;
  delay: number;
}

const BARS: BarConfig[] = [
  { duration: 620, delay: 0 },
  { duration: 780, delay: 120 },
  { duration: 540, delay: 240 },
];

const BAR_HEIGHT = 16;

function Bar({
  config,
  isPlaying,
  color,
}: {
  config: BarConfig;
  isPlaying: boolean;
  color: string;
}) {
  // scaleY scales from the center by default. To anchor the bar to the
  // bottom (so it visually grows upward), pair it with a translateY offset
  // of `BAR_HEIGHT * (1 - scaleY) / 2`. Both transforms use the native
  // driver — no JS thread work during the loop.
  const scale = useRef(new Animated.Value(0.5)).current;
  const translateY = scale.interpolate({
    inputRange: [0, 1],
    outputRange: [BAR_HEIGHT / 2, 0],
  });

  useEffect(() => {
    if (!isPlaying) {
      scale.stopAnimation();
      scale.setValue(0.5);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1,
          duration: config.duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
          delay: config.delay,
        }),
        Animated.timing(scale, {
          toValue: 0.25,
          duration: config.duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [config.delay, config.duration, isPlaying, scale]);

  return (
    <Animated.View
      style={[
        styles.bar,
        {
          backgroundColor: color,
          transform: [{ translateY }, { scaleY: scale }],
        },
      ]}
    />
  );
}

export function PlayingIndicator({
  isPlaying,
  color = THEME.accent,
}: {
  isPlaying: boolean;
  color?: string;
}) {
  return (
    <View style={styles.overlay} pointerEvents="none">
      <View style={styles.bars}>
        {BARS.map((b, i) => (
          <Bar key={i} config={b} isPlaying={isPlaying} color={color} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    height: BAR_HEIGHT,
  },
  bar: {
    width: 3,
    height: BAR_HEIGHT,
    borderRadius: 1,
  },
});
