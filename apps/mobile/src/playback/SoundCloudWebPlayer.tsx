import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SoundCloudTrackState {
  isPaused: boolean;
  currentPosition: number; // ms
  duration: number;        // ms
  trackTitle: string;
  artistName: string;
  artworkUrl: string;
}

interface SoundCloudPlayerContextValue {
  isReady: boolean;
  trackState: SoundCloudTrackState | null;
  load: (url: string) => void;
  play: () => void;
  pause: () => void;
  seek: (ms: number) => void;
  subscribeTrackEnd: (listener: () => void) => () => void;
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

const PLAYER_HTML = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#000;">
<iframe
  id="sc-player"
  src="https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2F33below%2Fclose-to-me&auto_play=false&buying=false&liking=false&download=false&sharing=false&show_comments=false&show_related=false&hide_related=true&visual=false"
  width="1"
  height="1"
  scrolling="no"
  frameborder="no"
  allow="autoplay">
</iframe>
<script src="https://w.soundcloud.com/player/api.js"></script>
<script>
  var widget = SC.Widget(document.getElementById('sc-player'));
  var currentPosition = 0;
  var duration = 0;

  function rn(data) {
    window.ReactNativeWebView.postMessage(JSON.stringify(data));
  }

  function emitState(isPaused) {
    widget.getCurrentSound(function(sound) {
      rn({
        type: 'stateChanged',
        state: {
          isPaused: isPaused,
          currentPosition: currentPosition,
          duration: duration,
          trackTitle: sound ? sound.title : '',
          artistName: sound ? sound.user.username : '',
          artworkUrl: sound ? (sound.artwork_url || '').replace('-large', '-t500x500') : '',
        }
      });
    });
  }

  widget.bind(SC.Widget.Events.READY, function() {
    widget.getDuration(function(d) { duration = d; });
    rn({ type: 'ready' });
  });

  widget.bind(SC.Widget.Events.PLAY, function() {
    widget.getDuration(function(d) { duration = d; });
    emitState(false);
  });

  widget.bind(SC.Widget.Events.PAUSE, function() {
    emitState(true);
  });

  // SC's PLAY_PROGRESS fires several times per second while a track is
  // playing. Capture the latest position into the closure and trickle a
  // throttled stateChanged across the bridge so React's displayPositionMs
  // (and the SeekBar) keep ticking. Without this, the time label stays
  // frozen at whatever the last PLAY/PAUSE event carried — visible as
  // (a) scrub-then-play stuck at the drop position and (b) 0:00 after
  // an auto-advance into an SC track from a Spotify track.
  var lastProgressEmit = 0;
  widget.bind(SC.Widget.Events.PLAY_PROGRESS, function(e) {
    currentPosition = e.currentPosition;
    var now = Date.now();
    if (now - lastProgressEmit < 500) return;
    lastProgressEmit = now;
    emitState(false);
  });

  widget.bind(SC.Widget.Events.FINISH, function() {
    rn({ type: 'finished' });
  });

  widget.bind(SC.Widget.Events.ERROR, function(e) {
    rn({ type: 'error', message: 'SC error: ' + JSON.stringify(e) });
  });

  window.scPlay = function() { widget.play(); };
  window.scPause = function() { widget.pause(); };
  window.scSeek = function(ms) { widget.seekTo(ms); };
  window.scLoad = function(url) {
    widget.load(url, {
      auto_play: true,
      buying: false,
      liking: false,
      download: false,
      sharing: false,
      show_comments: false,
      show_related: false,
      hide_related: true,
      visual: false,
    });
  };
</script>
</body>
</html>
`;

// ─── Context ──────────────────────────────────────────────────────────────────

const SoundCloudPlayerContext = createContext<SoundCloudPlayerContextValue>({
  isReady: false,
  trackState: null,
  load: () => {},
  play: () => {},
  pause: () => {},
  seek: () => {},
  subscribeTrackEnd: () => () => {},
});

export function useSoundCloudPlayer() {
  return useContext(SoundCloudPlayerContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SoundCloudPlayerProvider({ children }: { children: React.ReactNode }) {
  const webViewRef = useRef<WebView>(null);
  const [isReady, setIsReady] = useState(false);
  const [trackState, setTrackState] = useState<SoundCloudTrackState | null>(null);
  const trackEndListenersRef = useRef(new Set<() => void>());

  const subscribeTrackEnd = useCallback((listener: () => void) => {
    const set = trackEndListenersRef.current;
    set.add(listener);
    return () => { set.delete(listener); };
  }, []);

  const inject = useCallback((js: string) => {
    webViewRef.current?.injectJavaScript(`${js}; true;`);
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'ready') {
        setIsReady(true);
      } else if (msg.type === 'stateChanged') {
        setTrackState(msg.state);
      } else if (msg.type === 'finished') {
        setTrackState((s) => s ? { ...s, isPaused: true } : s);
        for (const fn of [...trackEndListenersRef.current]) {
          try { fn(); } catch {}
        }
      } else if (msg.type === 'error') {
        console.warn('[SoundCloudPlayer] error:', msg.message);
      }
    } catch {}
  }, []);

  const load = useCallback((url: string) => {
    inject(`window.scLoad(${JSON.stringify(url)})`);
  }, [inject]);

  const play = useCallback(() => inject('window.scPlay()'), [inject]);
  const pause = useCallback(() => inject('window.scPause()'), [inject]);
  const seek = useCallback((ms: number) => inject(`window.scSeek(${ms})`), [inject]);

  return (
    <SoundCloudPlayerContext.Provider value={{ isReady, trackState, load, play, pause, seek, subscribeTrackEnd }}>
      <View style={styles.hidden}>
        <WebView
          ref={webViewRef}
          source={{
            html: PLAYER_HTML,
            baseUrl: "https://soundcloud.com",
          }}
          onMessage={handleMessage}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          originWhitelist={['*']}
          onError={(e) => console.warn('[SoundCloudPlayer] WebView error', e.nativeEvent)}
        />
      </View>
      {children}
    </SoundCloudPlayerContext.Provider>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
});
