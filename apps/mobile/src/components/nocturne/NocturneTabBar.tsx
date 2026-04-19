import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { nocturne } from "@/theme/colors";
import { fonts } from "@/theme/fonts";
import { NowPlayingBar } from "@/components/NowPlayingBar";
import Svg, { Path, Circle } from "react-native-svg";

function HomeIcon({ active }: { active: boolean }) {
  const c = active ? nocturne.ink : nocturne.inkFaint;
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill={active ? c : "none"} stroke={c} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1v-9z" />
    </Svg>
  );
}

function ProfileIcon({ active }: { active: boolean }) {
  const c = active ? nocturne.ink : nocturne.inkFaint;
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={9} r={4} />
      <Path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" />
    </Svg>
  );
}

export function NocturneTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom - 12, 12);

  return (
    <View style={[styles.wrapper, { bottom: bottomOffset }]}>
      <NowPlayingBar />
      <View style={styles.pill}>
        {/* Blur background — clipped to the rounded pill via its own wrapper */}
        <View style={styles.blurWrap}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        </View>
        <View style={styles.pillContent}>
          {state.routes.map((route, index) => {
            const isFocused = state.index === index;
            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            // Center tab — the elevated "mix" puck
            if (route.name === "mix") {
              return (
                <TouchableOpacity
                  key={route.key}
                  onPress={onPress}
                  activeOpacity={0.85}
                  style={styles.mixPuckWrap}
                >
                  <View style={styles.mixPuckShadow}>
                    <LinearGradient
                      colors={[...nocturne.mixPuck]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.mixPuck}
                    >
                      <Text style={styles.mixLabel}>mix</Text>
                    </LinearGradient>
                  </View>
                </TouchableOpacity>
              );
            }

            const isHome = route.name === "(home)";
            return (
              <TouchableOpacity
                key={route.key}
                onPress={onPress}
                activeOpacity={0.7}
                style={styles.tabItem}
              >
                {isHome ? (
                  <HomeIcon active={isFocused} />
                ) : (
                  <ProfileIcon active={isFocused} />
                )}
                <Text
                  style={[
                    styles.tabLabel,
                    { color: isFocused ? nocturne.ink : nocturne.inkFaint },
                  ]}
                >
                  {isHome ? "Home" : "You"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 40,
  },
  pill: {
    height: 56,
    // No overflow:hidden here — the puck needs to elevate above the pill.
    // Rounded clipping is applied to the blur wrapper below instead.
  },
  blurWrap: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: nocturne.tabBorder,
    backgroundColor: nocturne.tabGlass,
  },
  pillContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: fonts.sansMedium,
  },
  // Mix puck — elevated center button
  mixPuckWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // Shadow wrapper. Renders outside the puck bounds via shadow, giving a
  // soft glow that follows the rounded-square shape.
  mixPuckShadow: {
    borderRadius: 24,
    shadowColor: nocturne.blue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 14,
    elevation: 12,
  },
  mixPuck: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  mixLabel: {
    fontFamily: fonts.serifItalic,
    fontSize: 18,
    color: "#fff",
  },
});
