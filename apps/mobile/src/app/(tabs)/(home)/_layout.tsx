import { Stack } from 'expo-router';

export default function HomeStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#000' },
        headerTintColor: '#fff',
        headerBackButtonDisplayMode: 'minimal',
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: '#000' },
        animation: 'default',
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="index"         options={{ headerShown: false }} />
      <Stack.Screen name="create-league" options={{ title: 'New League' }} />
      <Stack.Screen name="create-season" options={{ title: 'New Season' }} />
      <Stack.Screen name="league/[id]"   options={{ title: 'League' }} />
      <Stack.Screen name="season/[id]"   options={{ title: 'Season' }} />
      <Stack.Screen
        name="round/[id]"
        options={{
          // Transparent header keeps the native iOS back chevron (liquid
          // glass on iOS 26) without painting a bar over the wallpaper.
          headerTransparent: true,
          headerBlurEffect: undefined,
          headerStyle: { backgroundColor: 'transparent' },
          headerTitle: '',
          headerShadowVisible: false,
          headerTintColor: '#1A0814',
        }}
      />
      <Stack.Screen
        name="playlist/[id]"
        options={{
          // Same transparent-header treatment as the round screen so the
          // hero image bleeds full-bleed behind the iOS back chevron.
          headerTransparent: true,
          headerBlurEffect: undefined,
          headerStyle: { backgroundColor: 'transparent' },
          headerTitle: '',
          headerShadowVisible: false,
          headerTintColor: '#1A0814',
        }}
      />
    </Stack>
  );
}
