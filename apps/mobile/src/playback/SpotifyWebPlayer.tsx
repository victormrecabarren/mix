import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import {
  forceRefreshAccessToken,
  getValidAccessToken,
} from "@/lib/spotifyAuth";
import { normalizeSpotifyTrackUri } from "@/lib/spotifyTrackUri";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpotifyTrackState {
  isPaused: boolean;
  positionMs: number;
  durationMs: number;
  trackUri: string;
  trackName: string;
  artistName: string;
  artworkUrl: string;
}

interface SpotifyPlayerContextValue {
  isReady: boolean;
  trackState: SpotifyTrackState | null;
  play: (uri: string) => Promise<void>;
  pause: () => void;
  resume: () => void;
  seek: (positionMs: number) => void;
  init: (token: string) => void;
  abandonMixSpotifySession: () => void;
  subscribeExternalTakeover: (listener: () => void) => () => void;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function waitForDeviceInConnect(
  token: string,
  deviceId: string,
  timeoutMs = 20_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch("https://api.spotify.com/v1/me/player/devices", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const j = (await r.json()) as { devices?: { id: string }[] };
        if (j.devices?.some((d) => d.id === deviceId)) return true;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ─── HTML injected into the hidden WebView ────────────────────────────────────

const PLAYER_HTML = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<script>
(function() {
  window.__mixToken = null;
  window.__mixPlayer = null;
  window.__mixBoot = null;
  window.__mixSdkReadyPending = false;
  window.mixInit = function(accessToken) {
    window.__mixToken = accessToken;
    if (typeof window.__mixBoot === 'function') window.__mixBoot(accessToken);
  };
  window.mixPause = function() { if (window.__mixPlayer) window.__mixPlayer.pause(); };
  window.mixResume = function() { if (window.__mixPlayer) window.__mixPlayer.resume(); };
  window.mixSeek = function(positionMs) {
    if (window.__mixPlayer) window.__mixPlayer.seek(positionMs);
  };
  window.mixUpdateToken = function(newToken) {
    window.__mixToken = newToken;
    if (window.__mixPlayer) {
      window.__mixPlayer.getOAuthToken = function(cb) { cb(window.__mixToken); };
    }
  };
  window.mixRejectExternalPlayback = function() {};
  window.onSpotifyWebPlaybackSDKReady = function() {
    if (typeof window.__mixHandleSdkReady === 'function') window.__mixHandleSdkReady();
    else window.__mixSdkReadyPending = true;
  };
})();
</script>
<script src="https://sdk.scdn.co/spotify-player.js"></script>
<script>
(function() {
  var player = null;

  function rn(data) {
    window.ReactNativeWebView.postMessage(JSON.stringify(data));
  }

  function initPlayer(accessToken) {
    window.__mixToken = accessToken;
    if (player) { player.disconnect(); }

    player = new Spotify.Player({
      name: 'mix',
      getOAuthToken: function(cb) { cb(window.__mixToken); },
      volume: 0.8
    });
    window.__mixPlayer = player;

    player.addListener('ready', function(e) {
      rn({ type: 'ready', deviceId: e.device_id });
    });

    player.addListener('not_ready', function() {
      rn({ type: 'not_ready' });
    });

    player.addListener('player_state_changed', function(s) {
      if (!s) return;
      var t = s.track_window && s.track_window.current_track;
      rn({
        type: 'stateChanged',
        state: {
          isPaused: s.paused,
          positionMs: s.position,
          durationMs: s.duration,
          trackUri: t ? t.uri : '',
          trackName: t ? t.name : '',
          artistName: t ? t.artists.map(function(a){ return a.name; }).join(', ') : '',
          artworkUrl: t && t.album && t.album.images && t.album.images[0] ? t.album.images[0].url : '',
        }
      });
    });

    player.addListener('initialization_error', function(e) { rn({ type: 'error', message: 'Init: ' + e.message }); });
    player.addListener('authentication_error', function(e) { rn({ type: 'authentication_error', message: e.message }); });
    player.addListener('account_error', function(e) { rn({ type: 'error', message: 'Account: ' + e.message }); });

    player.connect().then(function(ok) {
      if (!ok) rn({ type: 'error', message: 'Failed to connect player' });
    });
  }

  window.__mixBoot = function(accessToken) {
    window.__mixToken = accessToken;
    if (window.Spotify && window.Spotify.Player) initPlayer(accessToken);
  };

  window.__mixHandleSdkReady = function() {
    rn({ type: 'sdkReady' });
    if (window.__mixToken) initPlayer(window.__mixToken);
  };

  if (window.__mixSdkReadyPending) {
    window.__mixSdkReadyPending = false;
    window.__mixHandleSdkReady();
  } else if (window.__mixToken && window.Spotify && window.Spotify.Player) {
    initPlayer(window.__mixToken);
  }

  window.mixRejectExternalPlayback = function() {
    try {
      if (player) {
        player.disconnect();
        player = null;
      }
      window.__mixPlayer = null;
    } catch (e) {}
  };
})();
</script>
</body>
</html>
`;

// ─── Context ──────────────────────────────────────────────────────────────────

const SpotifyPlayerContext = createContext<SpotifyPlayerContextValue>({
  isReady: false,
  trackState: null,
  play: async () => {},
  pause: () => {},
  resume: () => {},
  seek: () => {},
  init: () => {},
  abandonMixSpotifySession: () => {},
  subscribeExternalTakeover: () => () => {},
});

export function useSpotifyPlayer() {
  return useContext(SpotifyPlayerContext);
}

// ─── Hidden WebView ───────────────────────────────────────────────────────────

const HiddenWebView = ({
  webViewRef,
  remountKey,
  onMessage,
  onLoadStart,
  onLoadEnd,
  onTerminate,
}: {
  webViewRef: React.RefObject<WebView | null>;
  remountKey: number;
  onMessage: (e: WebViewMessageEvent) => void;
  onLoadStart: () => void;
  onLoadEnd: () => void;
  onTerminate: () => void;
}) => (
  <View style={styles.hidden}>
    <WebView
      key={remountKey}
      ref={webViewRef}
      source={{
        html: PLAYER_HTML,
        baseUrl: "https://sdk.scdn.co",
      }}
      onMessage={onMessage}
      onLoadStart={onLoadStart}
      onLoadEnd={onLoadEnd}
      onContentProcessDidTerminate={onTerminate}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      javaScriptEnabled
      domStorageEnabled
      sharedCookiesEnabled
      originWhitelist={["*"]}
      onError={(e) => console.warn("[SpotifyWebPlayer] WebView error", e.nativeEvent)}
    />
  </View>
);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SpotifyPlayerProvider({ children }: { children: React.ReactNode }) {
  const webViewRef = useRef<WebView>(null);
  const [remountKey, setRemountKey] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [trackState, setTrackState] = useState<SpotifyTrackState | null>(null);

  const webViewLoadedRef = useRef(false);
  const pendingTokenRef = useRef<string | null>(null);

  // Set only after device appears in GET /me/player/devices
  const deviceIdRef = useRef<string | null>(null);
  // Incremented on each `ready` event — stale async callbacks bail out if gen changed
  const readyGenRef = useRef(0);

  // Gate: suppress = ignore all stateChanged; accept = Mix owns playback
  const suppressRef = useRef(false);
  const acceptRef = useRef(false);
  const expectedUriRef = useRef<string | null>(null);

  const externalTakeoverListenersRef = useRef(new Set<() => void>());

  const subscribeExternalTakeover = useCallback((listener: () => void) => {
    const set = externalTakeoverListenersRef.current;
    set.add(listener);
    return () => { set.delete(listener); };
  }, []);

  const emitExternalTakeover = useCallback(() => {
    for (const fn of [...externalTakeoverListenersRef.current]) {
      try { fn(); } catch (e) { console.warn("[SpotifyWebPlayer] takeover listener error:", e); }
    }
  }, []);

  const inject = useCallback((js: string) => {
    webViewRef.current?.injectJavaScript(`${js}; true;`);
  }, []);

  const resetGate = useCallback(() => {
    suppressRef.current = false;
    acceptRef.current = false;
    expectedUriRef.current = null;
  }, []);

  // ── Message handler ────────────────────────────────────────────────────────

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as Record<string, unknown>;

      if (msg.type === "ready") {
        const gen = ++readyGenRef.current;
        const capturedDeviceId = msg.deviceId as string;
        deviceIdRef.current = null;
        setIsReady(false);
        void (async () => {
          const token = await getValidAccessToken();
          if (!token || readyGenRef.current !== gen) return;
          inject(`window.mixUpdateToken(${JSON.stringify(token)})`);
          const listed = await waitForDeviceInConnect(token, capturedDeviceId);
          if (readyGenRef.current !== gen) return;
          if (listed) {
            deviceIdRef.current = capturedDeviceId;
            setIsReady(true);
          } else {
            console.warn("[SpotifyWebPlayer] device never appeared in Connect");
          }
        })();

      } else if (msg.type === "not_ready") {
        deviceIdRef.current = null;
        setIsReady(false);
        setTrackState(null);

      } else if (msg.type === "stateChanged") {
        if (suppressRef.current) return;

        const s = msg.state as SpotifyTrackState;
        const playing = !s.isPaused && !!s.trackUri;

        if (!acceptRef.current) {
          // External source is playing — pause it and clear Mix state
          if (playing) {
            inject("window.mixPause()");
            setTrackState(null);
            emitExternalTakeover();
          }
          return;
        }

        const expected = expectedUriRef.current;
        if (expected && s.trackUri && s.trackUri !== expected) {
          // Wrong track playing — must be an external takeover
          inject("window.mixPause()");
          resetGate();
          setTrackState(null);
          emitExternalTakeover();
          return;
        }

        setTrackState(s);

      } else if (msg.type === "authentication_error") {
        console.warn("[SpotifyWebPlayer] auth error:", msg.message);
        setIsReady(false);
        deviceIdRef.current = null;
        resetGate();
        setTrackState(null);
        void (async () => {
          const t = await forceRefreshAccessToken();
          if (t) {
            pendingTokenRef.current = t;
            inject(`window.mixInit(${JSON.stringify(t)})`);
          }
        })();

      } else if (msg.type === "error") {
        console.warn("[SpotifyWebPlayer] error:", msg.message);
      } else if (msg.type === "log") {
        console.log("[SpotifyWebPlayer]", msg.message);
      }
    } catch {}
  }, [inject, resetGate, emitExternalTakeover]);

  // ── WebView lifecycle ──────────────────────────────────────────────────────

  const handleWebViewLoadStart = useCallback(() => {
    webViewLoadedRef.current = false;
    setIsReady(false);
    deviceIdRef.current = null;
    resetGate();
    setTrackState(null);
  }, [resetGate]);

  const handleWebViewLoadEnd = useCallback(() => {
    webViewLoadedRef.current = true;
    void (async () => {
      const tok = (await forceRefreshAccessToken()) ?? (await getValidAccessToken());
      if (tok) {
        pendingTokenRef.current = tok;
        inject(`window.mixInit(${JSON.stringify(tok)})`);
      }
    })();
  }, [inject]);

  const handleContentProcessDidTerminate = useCallback(() => {
    setRemountKey((k) => k + 1);
  }, []);

  // ── Public API ─────────────────────────────────────────────────────────────

  const init = useCallback((token: string) => {
    pendingTokenRef.current = token;
    if (webViewLoadedRef.current) {
      inject(`window.mixInit(${JSON.stringify(token)})`);
    }
  }, [inject]);

  const abandonMixSpotifySession = useCallback(() => {
    resetGate();
    setTrackState(null);
    inject("window.mixPause()");
  }, [inject, resetGate]);

  const play = useCallback(async (uri: string) => {
    const trackUri = normalizeSpotifyTrackUri(uri);
    if (!/^spotify:track:[0-9A-Za-z]{22}$/.test(trackUri)) {
      console.warn("[SpotifyWebPlayer] invalid track uri:", uri, "→", trackUri);
      return;
    }

    // Suppress stateChanged while we're taking over
    suppressRef.current = true;
    acceptRef.current = false;
    expectedUriRef.current = trackUri;

    try {
      const token = await getValidAccessToken();
      if (!token) {
        console.warn("[SpotifyWebPlayer] play: no valid token");
        resetGate();
        return;
      }

      // Boot the SDK if we don't have a device yet
      if (!deviceIdRef.current) {
        inject(`window.mixInit(${JSON.stringify(token)})`);
      }

      // Poll until deviceId is set (up to 30s)
      let deviceId: string | null = null;
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        if (deviceIdRef.current) { deviceId = deviceIdRef.current; break; }
        await new Promise((r) => setTimeout(r, 500));
      }

      if (!deviceId) {
        console.warn("[SpotifyWebPlayer] play: timed out waiting for device");
        resetGate();
        return;
      }

      const freshToken = (await getValidAccessToken()) ?? token;
      inject(`window.mixUpdateToken(${JSON.stringify(freshToken)})`);

      const doPlay = (tok: string, devId: string) =>
        fetch(
          `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(devId)}`,
          {
            method: "PUT",
            headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
            body: JSON.stringify({ uris: [trackUri] }),
          },
        );

      let res = await doPlay(freshToken, deviceId);

      // 404 = device not ready yet; wait and retry once
      if (res.status === 404) {
        await new Promise((r) => setTimeout(r, 2_000));
        const retryToken = (await getValidAccessToken()) ?? freshToken;
        res = await doPlay(retryToken, deviceId);
      }

      if (!res.ok) {
        const body = await res.text();
        console.warn("[SpotifyWebPlayer] play API failed:", res.status, body.slice(0, 200));
        resetGate();
        setTrackState(null);
        return;
      }

      // Success — open the gate
      acceptRef.current = true;
      suppressRef.current = false;
    } catch (e) {
      console.warn("[SpotifyWebPlayer] play error:", e);
      resetGate();
    }
  }, [inject, resetGate]);

  const pause = useCallback(() => inject("window.mixPause()"), [inject]);
  const resume = useCallback(() => inject("window.mixResume()"), [inject]);
  const seek = useCallback(
    (positionMs: number) => inject(`window.mixSeek(${positionMs})`),
    [inject],
  );

  // ── Keep token fresh on foreground ─────────────────────────────────────────

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      void (async () => {
        const t = await getValidAccessToken();
        if (t) inject(`window.mixUpdateToken(${JSON.stringify(t)})`);
      })();
    });
    return () => sub.remove();
  }, [inject]);

  return (
    <SpotifyPlayerContext.Provider
      value={{
        isReady,
        trackState,
        play,
        pause,
        resume,
        seek,
        init,
        abandonMixSpotifySession,
        subscribeExternalTakeover,
      }}
    >
      <HiddenWebView
        webViewRef={webViewRef}
        remountKey={remountKey}
        onMessage={handleMessage}
        onLoadStart={handleWebViewLoadStart}
        onLoadEnd={handleWebViewLoadEnd}
        onTerminate={handleContentProcessDidTerminate}
      />
      {children}
    </SpotifyPlayerContext.Provider>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
});
