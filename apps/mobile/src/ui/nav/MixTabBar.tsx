import { useEffect, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { House, Music, User } from "lucide-react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { GlassSurface } from "@/ui/glass/GlassSurface";
import { THEME } from "@/ui/theme/tokens";

const ACTIVE_RED = "#FC3C44";
const INACTIVE = THEME.ink;
const ROW_H_PAD = 6;
const ROW_V_PAD = 8;
const INDICATOR_INSET = 2;
const INDICATOR_V_INSET = 6;
const FLICK_VX = 0.5;

type TabConfig = {
  label: string;
  icon: (active: boolean) => React.ReactElement;
};

const TAB_CONFIG: Record<string, TabConfig> = {
  "(home)": {
    label: "Home",
    icon: (active) => (
      <House
        size={22}
        color={active ? ACTIVE_RED : INACTIVE}
        fill={active ? ACTIVE_RED : INACTIVE}
        strokeWidth={1.5}
      />
    ),
  },
  mix: {
    label: "Mix",
    icon: (active) => (
      <Music
        size={22}
        color={active ? ACTIVE_RED : INACTIVE}
        fill={active ? ACTIVE_RED : INACTIVE}
        strokeWidth={1.5}
      />
    ),
  },
  profile: {
    label: "Profile",
    icon: (active) => (
      <User
        size={22}
        color={active ? ACTIVE_RED : INACTIVE}
        fill={active ? ACTIVE_RED : INACTIVE}
        strokeWidth={1.5}
      />
    ),
  },
};

export function MixTabBar({ state, navigation }: BottomTabBarProps) {
  const [rowWidth, setRowWidth] = useState(0);
  const [displayIndex, setDisplayIndex] = useState(state.index);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const mounted = useRef(false);

  const tabCount = state.routes.length;
  const contentWidth = rowWidth - ROW_H_PAD * 2;
  const tabWidth = contentWidth / tabCount;

  // Sync displayIndex when tab changes via press
  useEffect(() => {
    setDisplayIndex(state.index);
    displayIdxRef.current = state.index;
  }, [state.index]);

  // Refs for stable access inside PanResponder closures
  const twRef = useRef(tabWidth);
  const tcRef = useRef(tabCount);
  const idxRef = useRef(state.index);
  const routesRef = useRef(state.routes);
  const navRef = useRef(navigation);
  const displayIdxRef = useRef(state.index);
  twRef.current = tabWidth;
  tcRef.current = tabCount;
  idxRef.current = state.index;
  routesRef.current = state.routes;
  navRef.current = navigation;

  const posFor = (i: number) =>
    ROW_H_PAD + i * twRef.current + INDICATOR_INSET;

  const dragStart = useRef(0);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_, gs) =>
        twRef.current > 0 && Math.abs(gs.dx) > 8,
      onPanResponderGrant: () => {
        dragStart.current = idxRef.current;
        Animated.spring(scaleAnim, {
          toValue: 1.2,
          useNativeDriver: true,
          tension: 300,
          friction: 12,
        }).start();
      },
      onPanResponderMove: (_, gs) => {
        const tw = twRef.current;
        const tc = tcRef.current;
        const raw = dragStart.current * tw + gs.dx;
        const clamped = Math.max(0, Math.min((tc - 1) * tw, raw));
        slideAnim.setValue(ROW_H_PAD + clamped + INDICATOR_INSET);

        const nearest = Math.round(
          Math.max(0, Math.min(tc - 1, clamped / tw)),
        );
        if (nearest !== displayIdxRef.current) {
          displayIdxRef.current = nearest;
          setDisplayIndex(nearest);
        }
      },
      onPanResponderRelease: (_, gs) => {
        const tw = twRef.current;
        const tc = tcRef.current;
        const raw = dragStart.current * tw + gs.dx;

        let target: number;
        if (Math.abs(gs.vx) > FLICK_VX) {
          target =
            gs.vx > 0
              ? Math.min(tc - 1, dragStart.current + 1)
              : Math.max(0, dragStart.current - 1);
        } else {
          target = Math.round(Math.max(0, Math.min(tc - 1, raw / tw)));
        }

        displayIdxRef.current = target;
        setDisplayIndex(target);

        Animated.parallel([
          Animated.spring(slideAnim, {
            toValue: ROW_H_PAD + target * tw + INDICATOR_INSET,
            useNativeDriver: true,
            tension: 180,
            friction: 15,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            tension: 180,
            friction: 14,
          }),
        ]).start();

        if (target !== idxRef.current) {
          const route = routesRef.current[target];
          if (route) navRef.current.navigate(route.name as never);
        }
      },
      onPanResponderTerminate: () => {
        displayIdxRef.current = idxRef.current;
        setDisplayIndex(idxRef.current);

        Animated.parallel([
          Animated.spring(slideAnim, {
            toValue: posFor(idxRef.current),
            useNativeDriver: true,
            tension: 300,
            friction: 25,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            tension: 300,
            friction: 20,
          }),
        ]).start();
      },
    }),
  ).current;

  useEffect(() => {
    if (!rowWidth) return;
    const toValue = posFor(state.index);
    if (!mounted.current) {
      slideAnim.setValue(toValue);
      mounted.current = true;
      return;
    }
    Animated.spring(slideAnim, {
      toValue,
      useNativeDriver: true,
      tension: 280,
      friction: 22,
    }).start();
  }, [state.index, tabWidth]);

  return (
    <View style={styles.wrap}>
      <GlassSurface glassEffectStyle="regular" interactive style={styles.pill}>
        <View
          style={styles.row}
          onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
          {...pan.panHandlers}
        >
          {rowWidth > 0 && (
            <Animated.View
              style={[
                styles.indicator,
                {
                  width: tabWidth - INDICATOR_INSET * 2,
                  transform: [
                    { translateX: slideAnim },
                    { scaleY: scaleAnim },
                  ],
                },
              ]}
            >
              <GlassSurface
                glassEffectStyle="clear"
                interactive
                tintColor="rgba(255,255,255,0.35)"
                style={styles.indicatorGlass}
              >
                <View style={styles.indicatorFill} />
              </GlassSurface>
            </Animated.View>
          )}

          {state.routes.map((route, index) => {
            const config = TAB_CONFIG[route.name];
            if (!config) return null;
            const focused = displayIndex === index;
            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (state.index !== index && !event.defaultPrevented) {
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
                <View style={styles.itemInner}>
                  {config.icon(focused)}
                  <Text
                    style={[
                      styles.label,
                      { color: focused ? ACTIVE_RED : INACTIVE },
                    ]}
                  >
                    {config.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  pill: {
    borderRadius: 32,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.25)",
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: ROW_H_PAD,
    paddingVertical: ROW_V_PAD,
  },
  indicator: {
    position: "absolute",
    top: INDICATOR_V_INSET,
    bottom: INDICATOR_V_INSET,
    borderRadius: 26,
    overflow: "hidden",
  },
  indicatorGlass: {
    flex: 1,
    borderRadius: 26,
    overflow: "hidden",
  },
  indicatorFill: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  item: { flex: 1, alignItems: "center", zIndex: 1 },
  itemInner: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    gap: 2,
  },
  label: {
    ...THEME.text.tabLabel,
    marginTop: 1,
  },
});
