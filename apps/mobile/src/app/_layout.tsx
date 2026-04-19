import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import {
  Fraunces_700Bold,
  Fraunces_900Black,
  Fraunces_700Bold_Italic,
  Fraunces_900Black_Italic,
} from "@expo-google-fonts/fraunces";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { SessionProvider, useSession } from "@/context/SessionContext";
import { LeagueProvider } from "@/context/LeagueContext";
import { SpotifyPlayerProvider, useSpotifyPlayer } from "@/playback/SpotifyWebPlayer";
import { SoundCloudPlayerProvider } from "@/playback/SoundCloudWebPlayer";
import { PlaybackProvider } from "@/playback/PlaybackContext";
import { getValidAccessToken } from "@/lib/spotifyAuth";

// Single app-wide query client. Defaults: 30s staleTime (briefly considered fresh
// on re-render), 5min gcTime (cache retained across unmounts). Refetch on window
// focus is off since RN doesn't have a "window focus" the way web does.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

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
  const [fontsLoaded] = useFonts({
    Fraunces_700Bold,
    Fraunces_900Black,
    Fraunces_700Bold_Italic,
    Fraunces_900Black_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#9B7BE8" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
    <QueryClientProvider client={queryClient}>
    <SessionProvider>
      <SpotifyPlayerProvider>
        <SoundCloudPlayerProvider>
        <PlaybackProvider>
        <LeagueProvider>
        <AuthGate>
          <Stack screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: "#000" } }}>
            <Stack.Screen name="(auth)/index" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="auth/callback" />
            <Stack.Screen name="join/index" />
          </Stack>
        </AuthGate>
        </LeagueProvider>
        </PlaybackProvider>
        </SoundCloudPlayerProvider>
      </SpotifyPlayerProvider>
    </SessionProvider>
    </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
