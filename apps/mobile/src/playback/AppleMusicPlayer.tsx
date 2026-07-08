import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import AppleMusic, {
  type AppleMusicAuthStatus,
  type AppleMusicStateEvent,
} from "apple-music";
import { auditMusicCredentials } from "@/lib/musicCredentialAudit";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppleMusicTrackState {
  isPaused: boolean;
  currentPosition: number; // ms
  duration: number; // ms
  trackTitle: string;
  artistName: string;
  artworkUrl: string;
}

interface AppleMusicPlayerContextValue {
  // True once MusicKit authorization is granted (playback is possible).
  isReady: boolean;
  trackState: AppleMusicTrackState | null;
  // Prompts for MusicKit authorization; returns the resulting status.
  authorize: () => Promise<AppleMusicAuthStatus>;
  play: (catalogId: string, isrc?: string) => void;
  pause: () => void;
  resume: () => void;
  seek: (ms: number) => void;
  subscribeTrackEnd: (listener: () => void) => () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AppleMusicPlayerContext = createContext<AppleMusicPlayerContextValue>({
  isReady: false,
  trackState: null,
  authorize: async () => "notDetermined",
  play: () => {},
  pause: () => {},
  resume: () => {},
  seek: () => {},
  subscribeTrackEnd: () => () => {},
});

export function useAppleMusicPlayer() {
  return useContext(AppleMusicPlayerContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const isIOS = Platform.OS === "ios";

export function AppleMusicPlayerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isReady, setIsReady] = useState(false);
  const [trackState, setTrackState] = useState<AppleMusicTrackState | null>(
    null,
  );
  const trackEndListenersRef = useRef(new Set<() => void>());
  const lastPauseCommandRef = useRef<{ at: number; reason: string } | null>(null);
  const lastPausedRef = useRef<boolean | null>(null);

  const subscribeTrackEnd = useCallback((listener: () => void) => {
    const set = trackEndListenersRef.current;
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }, []);

  // Wire native events + seed authorization state once.
  useEffect(() => {
    if (!isIOS) return;
    setIsReady(AppleMusic.getAuthorizationStatus() === "authorized");

    const stateSub = AppleMusic.addListener(
      "onStateChange",
      (e: AppleMusicStateEvent) => {
        const nextState = {
          isPaused: e.isPaused,
          currentPosition: e.currentPosition,
          duration: e.duration,
          trackTitle: e.trackTitle,
          artistName: e.artistName,
          artworkUrl: e.artworkUrl,
        };
        const previousPaused = lastPausedRef.current;
        lastPausedRef.current = nextState.isPaused;
        if (previousPaused === false && nextState.isPaused) {
          const pauseCommand = lastPauseCommandRef.current;
          console.log("[mix-debug] AppleMusic native state changed to paused", {
            trackTitle: nextState.trackTitle,
            currentPosition: nextState.currentPosition,
            duration: nextState.duration,
            recentJsPauseCommand: pauseCommand
              ? {
                  reason: pauseCommand.reason,
                  ageMs: Date.now() - pauseCommand.at,
                }
              : null,
          });
        }
        if (previousPaused === true && !nextState.isPaused) {
          lastPauseCommandRef.current = null;
        }
        setTrackState(nextState);
      },
    );
    const endSub = AppleMusic.addListener("onTrackEnd", () => {
      setTrackState((s) => (s ? { ...s, isPaused: true } : s));
      for (const fn of [...trackEndListenersRef.current]) {
        try {
          fn();
        } catch {}
      }
    });

    return () => {
      stateSub.remove();
      endSub.remove();
    };
  }, []);

  const authorize = useCallback(async (): Promise<AppleMusicAuthStatus> => {
    if (!isIOS) return "unknown";
    auditMusicCredentials("playback.appleMusic.authorize.requested", {
      provider: "applemusic",
      spotifyCredentialsUsed: false,
    });
    const status = await AppleMusic.requestAuthorization();
    setIsReady(status === "authorized");
    auditMusicCredentials("playback.appleMusic.authorize.complete", {
      provider: "applemusic",
      status,
      spotifyCredentialsUsed: false,
    });
    return status;
  }, []);

  const play = useCallback(
    (catalogId: string, isrc?: string) => {
      if (!isIOS) return;
      const authStatus = AppleMusic.getAuthorizationStatus();
      // The storefront the app's SEARCH used (device locale). Compare this to
      // the account storefront the native error prints — a mismatch means the
      // searched catalog id can't resolve at playback time.
      let deviceLocaleStorefront = "unknown";
      try {
        const locale = new Intl.Locale(
          Intl.DateTimeFormat().resolvedOptions().locale,
        );
        deviceLocaleStorefront = locale.region?.toLowerCase() ?? "us";
      } catch {}
      console.log("[mix-debug] AppleMusic.play() called", {
        catalogId,
        isrc,
        isReady,
        authStatus,
        deviceLocaleStorefront,
      });
      auditMusicCredentials("playback.appleMusic.play.requested", {
        provider: "applemusic",
        catalogId,
        isrc,
        isReady,
        authStatus,
        deviceLocaleStorefront,
        credentialSource: "apple-music-user-authorization",
        spotifyCredentialsUsed: false,
      });
      if (authStatus !== "authorized") {
        auditMusicCredentials("playback.appleMusic.play.blocked", {
          reason: "not-authorized",
          authStatus,
          spotifyCredentialsUsed: false,
        });
        console.warn(
          "[mix-debug] MusicKit NOT authorized — playback will fail. status:",
          authStatus,
        );
      }
      // Subscription is the #1 cause of a generic ApplicationMusicPlayer
      // failure. canPlayCatalogContent === false means no active Apple Music
      // subscription on this device account → streaming is denied.
      AppleMusic.checkSubscription()
        .then((sub) => {
          console.log("[mix-debug] subscription", sub);
        })
        .catch((e) => {
          console.warn(
            "[mix-debug] checkSubscription failed:",
            e?.message ?? String(e),
          );
        });
      const describeErr = (err: any) =>
        JSON.stringify({
          message: err?.message,
          code: err?.code,
          domain: err?.domain,
          userInfo: err?.userInfo,
        });
      // The first play right after MusicKit authorization can throw a generic
      // error before the subscription session is ready. Retry once after a
      // short delay to absorb that warm-up race.
      // Play the stored id directly — no lookup. The id was resolved once at
      // submission (from the search entry the user picked, so id + artwork are
      // consistent). `isrc` is passed only as the native module's storefront
      // recovery hint if the id ever fails to resolve on this device.
      const attempt = async () => {
        try {
          await AppleMusic.play(catalogId, isrc);
          setTimeout(() => {
            void AppleMusic.resume().catch((err) => {
              console.warn("[AppleMusicPlayer] post-play resume nudge failed:", err);
            });
          }, 200);
          lastPauseCommandRef.current = null;
          auditMusicCredentials("playback.appleMusic.play.started", {
            provider: "applemusic",
            catalogId,
            isrc,
            credentialSource: "apple-music-user-authorization",
            spotifyCredentialsUsed: false,
            retry: false,
          });
          console.log("[mix-debug] AppleMusic.play() resolved OK", { catalogId });
          return;
        } catch (err) {
          console.warn(
            "[AppleMusicPlayer] play failed, retrying once:",
            describeErr(err),
          );
        }
        await new Promise((r) => setTimeout(r, 300));
        try {
          await AppleMusic.play(catalogId, isrc);
          setTimeout(() => {
            void AppleMusic.resume().catch((err) => {
              console.warn("[AppleMusicPlayer] post-play retry resume nudge failed:", err);
            });
          }, 200);
          lastPauseCommandRef.current = null;
          auditMusicCredentials("playback.appleMusic.play.started", {
            provider: "applemusic",
            catalogId,
            isrc,
            credentialSource: "apple-music-user-authorization",
            spotifyCredentialsUsed: false,
            retry: true,
          });
          console.log("[mix-debug] AppleMusic.play() resolved OK (retry)", {
            catalogId,
          });
        } catch (err) {
          auditMusicCredentials("playback.appleMusic.play.failed", {
            provider: "applemusic",
            catalogId,
            isrc,
            credentialSource: "apple-music-user-authorization",
            spotifyCredentialsUsed: false,
          });
          console.warn(
            "[AppleMusicPlayer] play failed after retry — detail:",
            describeErr(err),
          );
          console.warn("[AppleMusicPlayer] play failed after retry — raw:", err);
        }
      };
      void attempt();
    },
    [isReady],
  );

  const pause = useCallback(() => {
    if (!isIOS) return;
    lastPauseCommandRef.current = { at: Date.now(), reason: "AppleMusicPlayer.pause()" };
    console.trace("[mix-debug] AppleMusic.pause() called");
    AppleMusic.pause();
  }, []);

  const resume = useCallback(() => {
    if (!isIOS) return;
    lastPauseCommandRef.current = null;
    void AppleMusic.resume().catch((err) => {
      console.warn("[AppleMusicPlayer] resume failed:", err);
    });
  }, []);

  const seek = useCallback((ms: number) => {
    if (!isIOS) return;
    AppleMusic.seek(ms);
  }, []);

  return (
    <AppleMusicPlayerContext.Provider
      value={{
        isReady,
        trackState,
        authorize,
        play,
        pause,
        resume,
        seek,
        subscribeTrackEnd,
      }}
    >
      {children}
    </AppleMusicPlayerContext.Provider>
  );
}
