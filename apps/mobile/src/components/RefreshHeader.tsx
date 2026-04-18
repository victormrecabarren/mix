import { useCallback, useRef, useState } from 'react';
import { Animated, ScrollView, ScrollViewProps, StyleSheet, View, ActivityIndicator } from 'react-native';

const TRIGGER_DISTANCE = 72; // px of overscroll needed to trigger
const HEADER_HEIGHT = 52;

type Props = ScrollViewProps & {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
};

/**
 * Drop-in ScrollView replacement with a custom pull-to-refresh header.
 * Avoids the native RefreshControl layout jump and invisible-spinner issues
 * on iOS 26 (Liquid Glass). The spinner lives inside the scroll content so
 * there is no reflow when it appears or disappears.
 */
export function RefreshScroll({ onRefresh, children, contentContainerStyle, ...rest }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const pullAnim = useRef(new Animated.Value(0)).current;
  const headerHeight = useRef(new Animated.Value(0)).current;

  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = e.nativeEvent.contentOffset.y;
    if (y < 0) {
      // User is over-scrolling upward — track how far
      const pull = Math.min(Math.abs(y), TRIGGER_DISTANCE * 1.5);
      pullAnim.setValue(pull);
    } else {
      pullAnim.setValue(0);
    }
  }, [pullAnim]);

  const handleScrollEnd = useCallback(async (e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = e.nativeEvent.contentOffset.y;
    if (y < -TRIGGER_DISTANCE && !refreshingRef.current) {
      refreshingRef.current = true;
      setRefreshing(true);

      // Animate header open
      Animated.timing(headerHeight, { toValue: HEADER_HEIGHT, duration: 150, useNativeDriver: false }).start();

      try {
        await onRefresh();
      } finally {
        // Animate header closed
        Animated.timing(headerHeight, { toValue: 0, duration: 200, useNativeDriver: false }).start(() => {
          setRefreshing(false);
          refreshingRef.current = false;
          pullAnim.setValue(0);
        });
      }
    }
  }, [onRefresh, headerHeight, pullAnim]);

  // Spinner opacity: fade in as user pulls, fully visible when refreshing
  const spinnerOpacity = refreshing
    ? 1
    : pullAnim.interpolate({ inputRange: [TRIGGER_DISTANCE * 0.5, TRIGGER_DISTANCE], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <ScrollView
      {...rest}
      onScroll={handleScroll}
      onScrollEndDragging={handleScrollEnd}
      scrollEventThrottle={16}
      contentContainerStyle={contentContainerStyle}
    >
      {/* Refresh header sits inside content — no layout jump */}
      <Animated.View style={[styles.header, { height: refreshing ? headerHeight : 0 }]}>
        <Animated.View style={{ opacity: spinnerOpacity }}>
          <ActivityIndicator color="#1DB954" />
        </Animated.View>
      </Animated.View>

      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
