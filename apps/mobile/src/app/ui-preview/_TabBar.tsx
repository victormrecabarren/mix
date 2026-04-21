// TEMP: floating liquid-glass tab bar — Apple Music style. Sits as its own
// pill, below the NowPlayingBar. Five items with the active one wrapped in
// a tinted pill background.

import { BlurView } from "expo-blur";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { v1 } from "./_tokens";

type TabKey = "home" | "search" | "radio" | "library" | "new";

const TABS: Array<{ key: TabKey; label: string; icon: (active: boolean) => React.ReactElement }> = [
  {
    key: "home",
    label: "Home",
    icon: (active) => <HomeIcon color={active ? v1.accent : v1.ink} />,
  },
  {
    key: "new",
    label: "New",
    icon: (active) => <GridIcon color={active ? v1.accent : v1.ink} />,
  },
  {
    key: "radio",
    label: "Radio",
    icon: (active) => <RadioIcon color={active ? v1.accent : v1.ink} />,
  },
  {
    key: "library",
    label: "Library",
    icon: (active) => <LibraryIcon color={active ? v1.accent : v1.ink} />,
  },
  {
    key: "search",
    label: "Search",
    icon: (active) => <SearchIcon color={active ? v1.accent : v1.ink} />,
  },
];

export function TabBar({ active = "home" as TabKey }: { active?: TabKey }) {
  return (
    <View style={styles.wrap}>
      <BlurView intensity={55} tint="light" style={styles.pill}>
        <View style={styles.row}>
          {TABS.map((t) => {
            const on = t.key === active;
            return (
              <Pressable key={t.key} style={styles.item} hitSlop={4}>
                <View style={[styles.itemInner, on && styles.itemInnerActive]}>
                  {t.icon(on)}
                  <Text
                    style={[
                      styles.label,
                      { color: on ? v1.accent : v1.ink },
                    ]}
                  >
                    {t.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

// ── Icons ────────────────────────────────────────────────────────────
// Simple character-based icons to avoid pulling in an icon library.
// Swap to react-native-svg or icon set when the design is finalized.

function HomeIcon({ color }: { color: string }) {
  return <Text style={[iconStyles.char, { color }]}>⌂</Text>;
}
function GridIcon({ color }: { color: string }) {
  return <Text style={[iconStyles.char, { color }]}>◨</Text>;
}
function RadioIcon({ color }: { color: string }) {
  return <Text style={[iconStyles.char, { color }]}>((•))</Text>;
}
function LibraryIcon({ color }: { color: string }) {
  return <Text style={[iconStyles.char, { color }]}>♫</Text>;
}
function SearchIcon({ color }: { color: string }) {
  return <Text style={[iconStyles.char, { color }]}>⌕</Text>;
}

const iconStyles = StyleSheet.create({
  char: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 24,
  },
});

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 10 },
  pill: {
    borderRadius: 32,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(11,11,11,0.06)",
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: 6,
    paddingVertical: 8,
    backgroundColor: "rgba(246,241,232,0.5)",
  },
  item: { flex: 1, alignItems: "center" },
  itemInner: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    gap: 2,
  },
  itemInnerActive: {
    backgroundColor: "rgba(176,42,42,0.10)",
  },
  label: {
    fontFamily: v1.fonts.sansSemi,
    fontSize: 10,
    letterSpacing: 0.2,
    marginTop: 1,
  },
});
