import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import "@/lib/disableFontScaling";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useFonts as useFraunces,
  Fraunces_400Regular,
  Fraunces_400Regular_Italic,
  Fraunces_500Medium,
  Fraunces_500Medium_Italic,
  Fraunces_700Bold,
  Fraunces_700Bold_Italic,
} from "@expo-google-fonts/fraunces";
import {
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
  InterTight_700Bold,
} from "@expo-google-fonts/inter-tight";
import {
  JetBrainsMono_700Bold,
  JetBrainsMono_800ExtraBold,
} from "@expo-google-fonts/jetbrains-mono";
import { SessionProvider, useSession } from "@/context/SessionContext";
import { LeagueProvider } from "@/context/LeagueContext";
import { VotingDraftProvider } from "@/context/VotingDraftContext";
import {
  SpotifyPlayerProvider,
  useSpotifyPlayer,
} from "@/playback/SpotifyWebPlayer";
import { SoundCloudPlayerProvider } from "@/playback/SoundCloudWebPlayer";
import { PlaybackProvider } from "@/playback/PlaybackContext";
import { getValidAccessToken } from "@/lib/spotifyAuth";

// UI preview design playground — kept for style/state experimentation.
// Navigate to it via the [DEV] button in the Profile tab.
// To permanently remove:
//   1. Delete `apps/mobile/src/app/ui-preview/`
//   2. Remove the `<Stack.Screen name="ui-preview" />` entry below
//   3. Remove the `inPreview` check in the redirect block in this file
//   4. Remove the [DEV] UI Preview button from ProfileTabScreen
const PREVIEW_DEFAULT: string | null = null;

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
    // TODO: remove this once the MVP tasks are completed and ready for production
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
  const [fontsLoaded] = useFraunces({
    Fraunces_400Regular,
    Fraunces_400Regular_Italic,
    Fraunces_500Medium,
    Fraunces_500Medium_Italic,
    Fraunces_700Bold,
    Fraunces_700Bold_Italic,
    InterTight_400Regular,
    InterTight_500Medium,
    InterTight_600SemiBold,
    InterTight_700Bold,
    JetBrainsMono_700Bold,
    JetBrainsMono_800ExtraBold,
  });

  if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <SpotifyPlayerProvider>
          <SoundCloudPlayerProvider>
            <PlaybackProvider>
              <LeagueProvider>
                <VotingDraftProvider>
                <AuthGate>
                  <Stack
                    screenOptions={{ headerShown: false, animation: "fade" }}
                  >
                    <Stack.Screen name="(auth)/index" />
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="auth/callback" />
                    <Stack.Screen name="join/index" />
                    {/* TEMP: preview routes for UI experiments. Delete when done. */}
                    <Stack.Screen name="ui-preview" />
                  </Stack>
                </AuthGate>
                </VotingDraftProvider>
              </LeagueProvider>
            </PlaybackProvider>
          </SoundCloudPlayerProvider>
        </SpotifyPlayerProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
