import { Stack } from 'expo-router';
import { PlaybackProvider } from '@/features/playback/PlaybackContext';

export default function RootLayout() {
  return (
    <PlaybackProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </PlaybackProvider>
  );
}
