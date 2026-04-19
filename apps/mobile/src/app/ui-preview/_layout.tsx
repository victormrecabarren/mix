// TEMP: preview stack for UI experiments. Delete the whole ui-preview folder
// to rip out. Uses Expo Router's standard Stack — native zoom transitions are
// supplied by the local `native-zoom` Expo Module, not at the navigator level.

import { Stack } from "expo-router";

export default function UiPreviewLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="playlist/[id]" />
      <Stack.Screen name="category/[id]" />
    </Stack>
  );
}
