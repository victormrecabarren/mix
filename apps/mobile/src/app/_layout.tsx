import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider, useSession } from "@/context/SessionContext";
import { LeagueProvider } from "@/context/LeagueContext";
import { SpotifyPlayerProvider, useSpotifyPlayer } from "@/playback/SpotifyWebPlayer";
import { SoundCloudPlayerProvider } from "@/playback/SoundCloudWebPlayer";
import { PlaybackProvider } from "@/playback/PlaybackContext";
import { getValidAccessToken } from "@/lib/spotifyAuth";

// TEMP: default route override for UI experimentation. To rip out, set to null.
const PREVIEW_DEFAULT: string | null = "/ui-preview";

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
    const inPreview = segments[0] === "ui-preview";

    // TEMP: while PREVIEW_DEFAULT is set, route all traffic into the preview.
    if (PREVIEW_DEFAULT && !inPreview && !inAuthCallback) {
      router.replace(PREVIEW_DEFAULT as never);
      return;
    }

    if (!session && !inAuthGroup && !inAuthCallback && !inPreview) {
      router.replace("/(auth)");
    } else if (session && inAuthGroup) {
      router.replace("/(tabs)/(home)");
    }
  }, [session, loading, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <SpotifyPlayerProvider>
          <SoundCloudPlayerProvider>
          <PlaybackProvider>
          <LeagueProvider>
          <AuthGate>
            <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
              <Stack.Screen name="(auth)/index" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="auth/callback" />
              <Stack.Screen name="join/index" />
              {/* TEMP: preview routes for UI experiments. Delete when done. */}
              <Stack.Screen name="ui-preview" />
            </Stack>
          </AuthGate>
          </LeagueProvider>
          </PlaybackProvider>
          </SoundCloudPlayerProvider>
        </SpotifyPlayerProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
