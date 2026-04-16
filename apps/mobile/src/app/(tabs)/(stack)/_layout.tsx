import { Stack } from 'expo-router';

export default function MainStackLayout() {
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
      <Stack.Screen name="create-league" options={{ title: 'New League' }} />
      <Stack.Screen name="create-season" options={{ title: 'New Season' }} />
      <Stack.Screen name="league/[id]" options={{ title: 'League' }} />
      <Stack.Screen name="season/[id]" options={{ title: 'Season' }} />
      <Stack.Screen name="round/[id]" options={{ title: 'Round' }} />
    </Stack>
  );
}
