import { StyleProp, StyleSheet, Text, TextStyle } from "react-native";
import { nocturne } from "@/theme/colors";
import { fonts } from "@/theme/fonts";

type Props = {
  children: React.ReactNode;
  color?: string;
  style?: StyleProp<TextStyle>;
};

/** Small uppercase label used above titles. */
export function Eyebrow({ children, color, style }: Props) {
  return (
    <Text style={[styles.text, color ? { color } : undefined, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: nocturne.inkMuted,
    fontFamily: fonts.sansSemiBold,
  },
});
