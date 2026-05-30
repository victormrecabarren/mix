import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

// SoundCloud's oEmbed endpoint (used by resolveSoundCloudTrack) doesn't expose
// track duration, so we can't length-check a SoundCloud pick the way we do a
// Spotify one. This hook spins up an ephemeral hidden WebView that loads the
// track into the SoundCloud Widget just long enough to read getDuration() on
// the READY event, then unmounts. It's the only no-API-key way to learn a
// SoundCloud track's length — DJ sets routinely run over an hour, so we have
// to gate them somehow.
//
// Usage:
//   const { probeDuration, probeView } = useSoundCloudDurationProbe();
//   render {probeView} somewhere; then `const ms = await probeDuration(url)`.
// Resolves the duration in ms, or null if the probe fails/times out (caller
// should fail open — a flaky probe shouldn't block a legitimate submission).

const PROBE_TIMEOUT_MS = 8000;

function probeHtml(trackUrl: string): string {
  const src =
    "https://w.soundcloud.com/player/?url=" +
    encodeURIComponent(trackUrl) +
    "&auto_play=false&visual=false&buying=false&liking=false" +
    "&download=false&sharing=false&show_comments=false&show_related=false";
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;">
<iframe id="p" src="${src}" width="1" height="1" frameborder="no" allow="autoplay"></iframe>
<script src="https://w.soundcloud.com/player/api.js"></script>
<script>
  var widget = SC.Widget(document.getElementById('p'));
  function rn(d){ window.ReactNativeWebView.postMessage(String(d)); }
  widget.bind(SC.Widget.Events.READY, function(){
    widget.getDuration(function(d){ rn(d); });
  });
  widget.bind(SC.Widget.Events.ERROR, function(){ rn('error'); });
</script>
</body>
</html>`;
}

export function useSoundCloudDurationProbe() {
  const [url, setUrl] = useState<string | null>(null);
  const resolveRef = useRef<((ms: number | null) => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback((ms: number | null) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setUrl(null);
    resolve?.(ms);
  }, []);

  const probeDuration = useCallback(
    (trackUrl: string) => {
      // Cancel any in-flight probe (resolves its promise as null) before
      // starting a new one — only one probe runs at a time.
      if (resolveRef.current) finish(null);
      return new Promise<number | null>((resolve) => {
        resolveRef.current = resolve;
        timerRef.current = setTimeout(() => finish(null), PROBE_TIMEOUT_MS);
        setUrl(trackUrl);
      });
    },
    [finish],
  );

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      const ms = Number(e.nativeEvent.data);
      finish(Number.isFinite(ms) && ms > 0 ? ms : null);
    },
    [finish],
  );

  // `key={url}` forces a fresh WebView per probe so the READY event fires for
  // the newly-loaded track rather than reusing a stale widget instance.
  const probeView = url ? (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        key={url}
        source={{ html: probeHtml(url), baseUrl: "https://soundcloud.com" }}
        onMessage={onMessage}
        javaScriptEnabled
        originWhitelist={["*"]}
        onError={() => finish(null)}
        onHttpError={() => finish(null)}
      />
    </View>
  ) : null;

  return { probeDuration, probeView };
}

const styles = StyleSheet.create({
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
});
