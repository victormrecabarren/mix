import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { SessionProvider, useSession } from "@/context/SessionContext";
import { SpotifyPlayerProvider, useSpotifyPlayer } from "@/playback/SpotifyWebPlayer";
import { SoundCloudPlayerProvider } from "@/playback/SoundCloudWebPlayer";
import { PlaybackProvider } from "@/playback/PlaybackContext";
import { getValidAccessToken } from "@/lib/spotifyAuth";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  const { init } = useSpotifyPlayer();
  const segments = useSegments();
  const router = useRouter();

  // SessionProvider calls `refresh()` on every AppState foreground → new `session` object reference
  // even for the same user. Depending on `session` would re-run `init` → `mixInit` and kill Web Playback.
  const spotifyUserId = session?.id ?? null;
  useEffect(() => {
    if (!spotifyUserId) return;
    void getValidAccessToken().then((token) => {
      if (token) init(token);
    });
  }, [spotifyUserId, init]);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === "(auth)";
    const inAuthCallback = segments[0] === "auth";
    if (!session && !inAuthGroup && !inAuthCallback) {
      router.replace("/(auth)");
    } else if (session && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [session, loading, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <SpotifyPlayerProvider>
        <SoundCloudPlayerProvider>
        <PlaybackProvider>
        <AuthGate>
          <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
            <Stack.Screen name="(auth)/index" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="auth/callback" />
            <Stack.Screen name="join/index" />
          </Stack>
        </AuthGate>
        </PlaybackProvider>
        </SoundCloudPlayerProvider>
      </SpotifyPlayerProvider>
    </SessionProvider>
  );
}
