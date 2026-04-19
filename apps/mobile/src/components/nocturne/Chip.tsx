import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { fonts } from "@/theme/fonts";

type Props = {
  label: string;
  color: string;
  style?: StyleProp<ViewStyle>;
};

/** Pill chip with a glowing dot and tinted background. */
export function Chip({ label, color, style }: Props) {
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: color + "33", borderColor: color + "55" },
        style,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: color, shadowColor: color }]} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.sansSemiBold,
    letterSpacing: 0.4,
  },
});
