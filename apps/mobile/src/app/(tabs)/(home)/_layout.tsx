import { useMemo } from 'react';
import { View } from 'react-native';
import type { ParamListBase, StackNavigationState } from '@react-navigation/native';
import {
  createStackNavigator,
  StackNavigationOptions,
  StackNavigationEventMap,
} from '@react-navigation/stack';
import { usePathname, withLayoutContext } from 'expo-router';
import { AmbientBackground } from '@/components/nocturne/AmbientBackground';
import { resolveAmbientForPath } from '@/components/nocturne/ambientColors';
import {
  simpleSlide,
  openTransitionSpec,
  closeTransitionSpec,
} from '@/components/nocturne/parallaxTransition';
import { nocturne } from '@/theme/colors';

// @react-navigation/stack plugged into Expo Router's file-based routing.
const { Navigator } = createStackNavigator();

const JsStack = withLayoutContext<
  StackNavigationOptions,
  typeof Navigator,
  StackNavigationState<ParamListBase>,
  StackNavigationEventMap
>(Navigator);

export default function HomeStackLayout() {
  const pathname = usePathname();
  const palette = useMemo(() => resolveAmbientForPath(pathname), [pathname]);

  return (
    <View style={{ flex: 1 }}>
      <AmbientBackground
        accentColor={palette.accent}
        secondaryColor={palette.secondary}
      >
        <JsStack
          screenOptions={{
            headerShown: true,
            headerTransparent: true,
            headerStyle: { backgroundColor: 'transparent' },
            headerTintColor: nocturne.ink,
            headerBackTitle: '',
            headerTitleStyle: { fontWeight: '700' },
            headerShadowVisible: false,
            cardStyle: { backgroundColor: 'transparent' },
            cardStyleInterpolator: simpleSlide,
            transitionSpec: {
              open: openTransitionSpec,
              close: closeTransitionSpec,
            },
            gestureEnabled: true,
            gestureResponseDistance: 500,
          }}
        >
          <JsStack.Screen name="index"         options={{ headerShown: false }} />
          <JsStack.Screen name="create-league" options={{ title: 'New League' }} />
          <JsStack.Screen name="create-season" options={{ title: 'New Season' }} />
          <JsStack.Screen name="league/[id]"   options={{ title: 'League' }} />
          <JsStack.Screen name="season/[id]"   options={{ title: 'Season' }} />
          <JsStack.Screen name="round/[id]"    options={{ title: 'Round' }} />
        </JsStack>
      </AmbientBackground>
    </View>
  );
}
