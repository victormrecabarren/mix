import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';

const { height: SCREEN_H } = Dimensions.get('window');

type SwipeSheetRenderProps = {
  dismiss: () => void;
};

type SwipeSheetProps = {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode | ((props: SwipeSheetRenderProps) => React.ReactNode);
  renderHeaderRight?: (props: SwipeSheetRenderProps) => React.ReactNode;
  backgroundColor?: string;
  backdropColor?: string;
  sheetStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  showBackdrop?: boolean;
  dismissOnBackdropPress?: boolean;
  showHandle?: boolean;
  headerTopInset?: number;
  dismissThreshold?: number;
  dismissVelocityThreshold?: number;
  closeDuration?: number;
  openDamping?: number;
  openStiffness?: number;
  springBackDamping?: number;
  springBackStiffness?: number;
};

export function SwipeSheet({
  visible,
  onRequestClose,
  children,
  renderHeaderRight,
  backgroundColor = colors.bgPrimary,
  backdropColor = 'rgba(0,0,0,0.45)',
  sheetStyle,
  contentStyle,
  showBackdrop = true,
  dismissOnBackdropPress = true,
  showHandle = true,
  headerTopInset,
  dismissThreshold = 80,
  dismissVelocityThreshold = 0.5,
  closeDuration = 280,
  openDamping = 22,
  openStiffness = 200,
  springBackDamping = 30,
  springBackStiffness = 300,
}: SwipeSheetProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SCREEN_H)).current;
  const closingRef = useRef(false);
  const resolvedHeaderTopInset = headerTopInset ?? insets.top + 12;

  const resetPosition = useCallback(() => {
    Animated.spring(translateY, {
      toValue: 0,
      damping: springBackDamping,
      stiffness: springBackStiffness,
      useNativeDriver: true,
    }).start();
  }, [springBackDamping, springBackStiffness, translateY]);

  const dismiss = useCallback((durationOverride?: number) => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.timing(translateY, {
      toValue: SCREEN_H,
      duration: durationOverride ?? closeDuration,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onRequestClose();
    });
  }, [closeDuration, onRequestClose, translateY]);

  useEffect(() => {
    if (!visible) return;
    closingRef.current = false;
    translateY.setValue(SCREEN_H);
    Animated.spring(translateY, {
      toValue: 0,
      damping: openDamping,
      stiffness: openStiffness,
      useNativeDriver: true,
    }).start();
  }, [openDamping, openStiffness, translateY, visible]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponderCapture: (_, { dy, dx }) =>
      dy > 8 && Math.abs(dy) > Math.abs(dx) * 1.5,
    onPanResponderTerminationRequest: () => true,
    onPanResponderMove: (_, { dy }) => {
      if (dy > 0) translateY.setValue(dy);
    },
    onPanResponderRelease: (_, { dy, vy }) => {
      if (dy > dismissThreshold || vy > dismissVelocityThreshold) {
        const remaining = SCREEN_H - dy;
        const velocityBasedMs = vy > 0.1 ? (remaining / vy) : closeDuration;
        const duration = Math.min(closeDuration, Math.max(120, velocityBasedMs));
        dismiss(duration);
        return;
      }
      resetPosition();
    },
    onPanResponderTerminate: resetPosition,
  }), [
    closeDuration,
    dismiss,
    dismissThreshold,
    dismissVelocityThreshold,
    resetPosition,
    translateY,
  ]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={() => dismiss()}>
      <View style={styles.overlay}>
        {showBackdrop && (
          <Pressable
            style={[styles.backdrop, { backgroundColor: backdropColor }]}
            onPress={dismissOnBackdropPress ? () => dismiss() : undefined}
          />
        )}
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor, transform: [{ translateY }] },
            sheetStyle,
          ]}
          {...panResponder.panHandlers}
        >
          {showHandle && (
            <View style={[styles.handleWrap, { paddingTop: resolvedHeaderTopInset }]}>
              <View style={styles.handle} />
              <View style={styles.headerRight}>
                {renderHeaderRight?.({ dismiss: () => dismiss() })}
              </View>
            </View>
          )}
          <View style={[styles.content, contentStyle]}>
            {typeof children === 'function' ? children({ dismiss: () => dismiss() }) : children}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    flex: 1,
  },
  handleWrap: {
    alignItems: 'center',
    paddingBottom: 8,
    position: 'relative',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textDim,
  },
  headerRight: {
    position: 'absolute',
    right: 20,
    bottom: 0,
  },
});
