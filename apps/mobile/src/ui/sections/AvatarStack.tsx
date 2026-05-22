// Overlapping avatar row. Canonical version of the inline AvatarStack
// pattern duplicated across screens. Theme-tokenized so swapping the
// visual system restyles every consumer.

import { Image } from "expo-image";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { THEME } from "@/ui/theme";

export type AvatarParticipant = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
};

export type AvatarStackProps = {
  participants: AvatarParticipant[];
  max?: number;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

// Rotating palette for avatar fallbacks. Hand-tuned editorial hues that
// read well against the cream background. We pick by visual index in the
// rendered stack so the first participant always lands on the same hue.
const FALLBACK_COLORS = ["#B4A5E8", "#C28BD4", "#F2C55C", "#7AB7C2", "#E89B7A"];
function colorFor(i: number): string {
  return FALLBACK_COLORS[i % FALLBACK_COLORS.length]!;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

export function AvatarStack({
  participants,
  max = 4,
  size = 28,
  style,
}: AvatarStackProps) {
  const overflow = participants.length > max ? participants.length - (max - 1) : 0;
  const shown = overflow > 0 ? participants.slice(0, max - 1) : participants.slice(0, max);

  const bubbleStyle = (i: number, bg: string): StyleProp<ViewStyle> => [
    styles.bubble,
    {
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: bg,
      marginLeft: i === 0 ? 0 : -Math.round(size * 0.28),
      zIndex: participants.length - i,
    },
  ];

  return (
    <View style={[styles.row, style]}>
      {shown.map((p, i) => {
        const bg = colorFor(i);
        return (
          <View key={p.id} style={bubbleStyle(i, bg)}>
            {p.avatarUrl ? (
              <Image
                source={{ uri: p.avatarUrl }}
                style={[styles.image, { borderRadius: size / 2 }]}
                contentFit="cover"
                transition={0}
              />
            ) : (
              <Text style={[styles.initial, { fontSize: Math.round(size * 0.4) }]}>
                {initialsFor(p.displayName)}
              </Text>
            )}
          </View>
        );
      })}
      {overflow > 0 && (
        <View style={bubbleStyle(shown.length, THEME.faint)}>
          <Text style={[styles.initial, { fontSize: Math.round(size * 0.36) }]}>
            +{overflow}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  bubble: {
    borderWidth: 2,
    borderColor: THEME.bg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  initial: {
    ...THEME.text.avatarInitial,
  },
});
