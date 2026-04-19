import { Easing } from "react-native";
import type { StackCardInterpolationProps } from "@react-navigation/stack";

/**
 * Simple slide transition with outgoing fade-out:
 *   - Incoming screen slides in from the right.
 *   - Outgoing screen fades to opacity 0 on a non-linear curve — it clears
 *     by the time the incoming screen is ~40% of the way in, so the two
 *     don't visually clash while both are on screen.
 *
 * The ambient background (outside the stack) never moves. On pop the
 * animation reverses: top card slides off right while the one beneath
 * fades back to opacity 1.
 */
export const simpleSlide = ({
  current,
  next,
  layouts,
}: StackCardInterpolationProps) => {
  const { width } = layouts.screen;

  const translateX = current.progress.interpolate({
    inputRange: [0, 1],
    outputRange: [width, 0],
    extrapolate: "clamp",
  });

  // Fade-out: linear feel at the start, slight acceleration near the end.
  // Opacity reaches 0 at 85% of the transition, so the previous page is gone
  // just before the push completes (no "half-visible" lingering at the end).
  const cardOpacity = next
    ? next.progress.interpolate({
        inputRange: [0, 0.65, 0.85, 1],
        outputRange: [1, 0.35, 0, 0],
        extrapolate: "clamp",
      })
    : 1;

  return {
    cardStyle: {
      transform: [{ translateX }],
      opacity: cardOpacity,
    },
  };
};

const bezier = Easing.bezier(0.32, 0.72, 0, 1);

export const openTransitionSpec = {
  animation: "timing" as const,
  config: { duration: 360, easing: bezier },
};

export const closeTransitionSpec = {
  animation: "timing" as const,
  config: { duration: 340, easing: bezier },
};
