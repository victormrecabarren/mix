// "Your playlists · 8 · all seasons ›" style section header.
// Title on the left, optional count, optional trailing label that can act
// as a navigation hint (renders the › glyph automatically).

import { Pressable, StyleSheet, Text, View } from "react-native";
import { THEME } from "@/ui/theme";

export type SectionHeaderProps = {
  title: string;
  count?: number | string;
  trailingLabel?: string;
  onTrailingPress?: () => void;
};

export function SectionHeader({
  title,
  count,
  trailingLabel,
  onTrailingPress,
}: SectionHeaderProps) {
  // The preview's meta segment renders count + trailing label joined by ·,
  // followed by a trailing ›. We mirror that exactly so swapping the inline
  // header for this component is a wash visually.
  const metaParts: string[] = [];
  if (count !== undefined && count !== null && count !== "") {
    metaParts.push(String(count));
  }
  if (trailingLabel) metaParts.push(trailingLabel);
  const meta = metaParts.length > 0 ? `${metaParts.join(" · ")} ›` : null;

  const metaNode = meta ? <Text style={styles.meta}>{meta}</Text> : null;

  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {metaNode != null &&
        (onTrailingPress ? (
          <Pressable onPress={onTrailingPress} hitSlop={8}>
            {metaNode}
          </Pressable>
        ) : (
          metaNode
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 28,
  },
  title: {
    ...THEME.text.sectionTitle,
  },
  meta: {
    ...THEME.text.sectionMeta,
  },
});
