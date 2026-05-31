import { useRef } from "react";
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type BouncyPressableProps = PressableProps & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
};

export function BouncyPressable({
  children,
  disabled,
  onPressIn,
  onPressOut,
  pressedScale = 1.08,
  style,
  ...props
}: BouncyPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value: number) => {
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      speed: 34,
      bounciness: 7,
    }).start();
  };

  return (
    <Pressable
      {...props}
      disabled={disabled}
      onPressIn={(event) => {
        if (!disabled) animateTo(pressedScale);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (!disabled) animateTo(1);
        onPressOut?.(event);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
