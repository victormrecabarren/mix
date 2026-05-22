// Bordered list of seasons. Active seasons show your live rank/points;
// completed seasons show the champion. The icon's letter is the first
// character of the season name.

import { Pressable, StyleSheet, Text, View } from "react-native";
import { THEME } from "@/ui/theme";

export type SeasonsListSeason = {
  id: string;
  name: string;
  status: "active" | "completed";
  you?: { rank: number; points: number };
  championName?: string;
};

export type SeasonsListProps = {
  seasons: SeasonsListSeason[];
  onPress?: (id: string) => void;
};

function statusLine(s: SeasonsListSeason): string {
  if (s.status === "active") {
    if (s.you) {
      return `In progress · rank #${s.you.rank} · ${s.you.points} pts`;
    }
    return "In progress";
  }
  if (s.championName) {
    return `Wrapped · ${s.championName} took it`;
  }
  return "Wrapped";
}

export function SeasonsList({ seasons, onPress }: SeasonsListProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.label}>Seasons</Text>
      {seasons.map((s, i) => {
        const isLast = i === seasons.length - 1;
        const row = (
          <View style={[styles.row, !isLast && styles.rowBorder]}>
            <View
              style={[
                styles.icon,
                { backgroundColor: s.status === "active" ? THEME.accent : THEME.ink },
              ]}
            >
              <Text style={styles.iconLetter}>{s.name[0] ?? "?"}</Text>
            </View>
            <View style={styles.body}>
              <Text style={styles.name}>{s.name}</Text>
              <Text style={styles.status}>{statusLine(s)}</Text>
            </View>
            <Text style={styles.arrow}>→</Text>
          </View>
        );
        return onPress ? (
          <Pressable key={s.id} onPress={() => onPress(s.id)}>
            {row}
          </Pressable>
        ) : (
          <View key={s.id}>{row}</View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 32,
    paddingHorizontal: 22,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: THEME.rule,
  },
  label: {
    ...THEME.text.seasonsLabel,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: THEME.rule,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  iconLetter: {
    ...THEME.text.seasonIconLetter,
  },
  body: { flex: 1 },
  name: {
    ...THEME.text.seasonName,
  },
  status: {
    ...THEME.text.seasonStatus,
    marginTop: 2,
  },
  arrow: {
    ...THEME.text.seasonArrow,
  },
});
