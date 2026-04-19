import { Stack } from 'expo-router';
import { View } from 'react-native';
import { AmbientBackground } from '@/components/nocturne/AmbientBackground';
import { nocturne } from '@/theme/colors';

export default function HomeStackLayout() {
  // Ambient background lives OUTSIDE the Stack so it doesn't animate during
  // push/pop — only the stack screens slide. The Stack uses transparent
  // content styling so the ambient shows through every screen.
  return (
    <View style={{ flex: 1 }}>
      <AmbientBackground>
        <Stack
          screenOptions={{
            headerShown: true,
            headerTransparent: true,
            headerStyle: { backgroundColor: 'transparent' },
            headerTintColor: nocturne.ink,
            headerBackButtonDisplayMode: 'minimal',
            headerTitleStyle: { fontWeight: '700' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: 'transparent' },
            animation: 'default',
            gestureEnabled: true,
          }}
        >
          <Stack.Screen name="index"         options={{ headerShown: false }} />
          <Stack.Screen name="create-league" options={{ title: 'New League' }} />
          <Stack.Screen name="create-season" options={{ title: 'New Season' }} />
          <Stack.Screen name="league/[id]"   options={{ title: 'League' }} />
          <Stack.Screen name="season/[id]"   options={{ title: 'Season' }} />
          <Stack.Screen name="round/[id]"    options={{ title: 'Round' }} />
        </Stack>
      </AmbientBackground>
    </View>
  );
}
