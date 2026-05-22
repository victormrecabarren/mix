// Liquid-glass floating tab bar — Apple Music style. Adapts BottomTabBarProps
// from React Navigation into the same visual treatment as the preview's
// `_TabBar.tsx`. Three tabs only: Home / Mix / Profile.

import { BlurView } from "expo-blur";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { THEME } from "@/ui/theme/tokens";

type TabConfig = {
  label: string;
  icon: (active: boolean) => React.ReactElement;
};

const TAB_CONFIG: Record<string, TabConfig> = {
  "(home)": {
    label: "Home",
    icon: (active) => <HomeIcon color={active ? THEME.accent : THEME.ink} />,
  },
  mix: {
    label: "Mix",
    icon: (active) => <NoteIcon color={active ? THEME.accent : THEME.ink} />,
  },
  profile: {
    label: "Profile",
    icon: (active) => <PersonIcon color={active ? THEME.accent : THEME.ink} />,
  },
};

export function MixTabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.wrap}>
      <BlurView intensity={55} tint="light" style={styles.pill}>
        <View style={styles.row}>
          {state.routes.map((route, index) => {
            const config = TAB_CONFIG[route.name];
            if (!config) return null;
            const focused = state.index === index;
            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name as never);
              }
            };
            return (
              <Pressable
                key={route.key}
                style={styles.item}
                onPress={onPress}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
              >
                <View
                  style={[styles.itemInner, focused && styles.itemInnerActive]}
                >
                  {config.icon(focused)}
                  <Text
                    style={[
                      styles.label,
                      { color: focused ? THEME.accent : THEME.ink },
                    ]}
                  >
                    {config.label}
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
// Glyph icons to match the preview's style — no extra dependencies.

function HomeIcon({ color }: { color: string }) {
  return <Text style={[iconStyles.char, { color }]}>⌂</Text>;
}
function NoteIcon({ color }: { color: string }) {
  return <Text style={[iconStyles.char, { color }]}>♫</Text>;
}
function PersonIcon({ color }: { color: string }) {
  return <Text style={[iconStyles.char, { color }]}>☻</Text>;
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
    ...THEME.text.tabLabel,
    marginTop: 1,
  },
});
