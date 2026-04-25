// TEMP: preview stack for UI experiments. Delete the whole ui-preview folder
// to rip out. Uses Expo Router's standard Stack — native zoom transitions are
// supplied by the local `native-zoom` Expo Module, not at the navigator level.

import { Stack } from "expo-router";
import { v1 } from "./_tokens";

export default function UiPreviewLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // react-native-screens defaults the container background to black,
        // which shows through during the zoom transition and produces a
        // flash. Setting it to the page background color removes the flash.
        contentStyle: { backgroundColor: v1.bg },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="playlist/[id]"
        // getId makes each unique id a distinct screen instance. Without it,
        // React Navigation re-uses the same VC when you pop detail-A and
        // push detail-B — which short-circuits the native push, kills the
        // zoom animation, and renders stale params until React catches up.
        getId={({ params }) =>
          (params as { id?: string } | undefined)?.id
        }
      />
    </Stack>
  );
}
