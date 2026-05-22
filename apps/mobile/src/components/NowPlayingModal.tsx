// Full-screen "Now Playing" modal — extracted from NowPlayingBar.tsx so the
// new floating pill (NowPlayingPillConnected) can render it without dragging
// in the legacy mini-bar layout. Logic mirrors the original; if behavior in
// the legacy NowPlayingBar evolves, port the change here too.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayback } from '@/playback/PlaybackContext';
import { SwipeSheet } from '@/components/SwipeSheet';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMs(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

// ─── SeekBar ──────────────────────────────────────────────────────────────────

function SeekBar({
  positionMs,
  durationMs,
  onSeek,
}: {
  positionMs: number;
  durationMs: number;
  onSeek: (ms: number) => void;
}) {
  const [barWidth, setBarWidth] = useState(1);
  const progress = durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0;
  const fillWidth = progress * barWidth;

  const handleTouch = useCallback(
    (x: number) => {
      const ratio = Math.max(0, Math.min(x / barWidth, 1));
      onSeek(Math.round(ratio * durationMs));
    },
    [barWidth, durationMs, onSeek],
  );

  return (
    <View style={seekStyles.wrap}>
      <View
        style={seekStyles.hitArea}
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => handleTouch(e.nativeEvent.locationX)}
        onResponderMove={(e) => handleTouch(e.nativeEvent.locationX)}
      >
        <View style={seekStyles.track}>
          <View style={[seekStyles.fill, { width: fillWidth }]} />
        </View>
        <View style={[seekStyles.thumb, { left: Math.max(0, fillWidth - 6) }]} />
      </View>
      <View style={seekStyles.labels}>
        <Text style={seekStyles.time}>{formatMs(positionMs)}</Text>
        <Text style={seekStyles.time}>{durationMs > 0 ? formatMs(durationMs) : '--:--'}</Text>
      </View>
    </View>
  );
}

const seekStyles = StyleSheet.create({
  wrap: { width: '100%', gap: 6 },
  hitArea: { height: 28, justifyContent: 'center', width: '100%' },
  track: { height: 4, backgroundColor: '#333', borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: '#fff', borderRadius: 2 },
  thumb: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff', top: 8 },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontSize: 11, color: '#666' },
});

// ─── ControlBtn ───────────────────────────────────────────────────────────────

function ControlBtn({
  label,
  onPress,
  disabled,
  large,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  large?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[ctrlStyles.btn, large && ctrlStyles.btnLarge, disabled && ctrlStyles.btnDisabled]}
    >
      <Text style={[ctrlStyles.label, large && ctrlStyles.labelLarge]}>{label}</Text>
    </TouchableOpacity>
  );
}

const ctrlStyles = StyleSheet.create({
  btn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' },
  btnLarge: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#fff' },
  btnDisabled: { opacity: 0.3 },
  label: { fontSize: 20, color: '#fff' },
  labelLarge: { fontSize: 26, color: '#000' },
});

// ─── Album art swiper (inside modal) ─────────────────────────────────────────

const ART_SIZE = 240;

type SwiperPanel = { artworkUrl: string; title: string; artist: string } | null;

function AlbumArtSwiper() {
  const { currentIndex, playlist, artworkUrl, title, artist, next, previous } = usePlayback();
  const translateX = useRef(new Animated.Value(0)).current;

  const artCache = useRef(new Map<string, string>());

  useEffect(() => {
    if (currentIndex !== null && artworkUrl) {
      artCache.current.set(playlist[currentIndex].id, artworkUrl);
    }
  }, [artworkUrl, currentIndex, playlist]);

  useEffect(() => {
    if (currentIndex === null) return;
    const neighbors = [
      currentIndex > 0 ? playlist[currentIndex - 1] : null,
      currentIndex < playlist.length - 1 ? playlist[currentIndex + 1] : null,
    ];
    for (const track of neighbors) {
      if (!track) continue;
      const url = artCache.current.get(track.id) || track.artworkUrl;
      if (url) void Image.prefetch(url);
    }
  }, [currentIndex, playlist]);

  const getArtUrl = (index: number): string => {
    if (index < 0 || index >= playlist.length) return '';
    const track = playlist[index];
    return artCache.current.get(track.id) || track.artworkUrl || '';
  };

  const hasNextRef = useRef(false);
  const hasPrevRef = useRef(false);
  const nextFnRef = useRef(next);
  const prevFnRef = useRef(previous);
  hasNextRef.current = currentIndex !== null && currentIndex < playlist.length - 1;
  hasPrevRef.current = currentIndex !== null && currentIndex > 0;
  nextFnRef.current = next;
  prevFnRef.current = previous;

  const prevPanel: SwiperPanel = hasPrevRef.current && currentIndex !== null
    ? { artworkUrl: getArtUrl(currentIndex - 1), title: playlist[currentIndex - 1].title, artist: playlist[currentIndex - 1].artist }
    : null;
  const currentPanel: SwiperPanel = {
    artworkUrl: (currentIndex !== null ? getArtUrl(currentIndex) : '') || artworkUrl || '',
    title,
    artist,
  };
  const nextPanel: SwiperPanel = hasNextRef.current && currentIndex !== null
    ? { artworkUrl: getArtUrl(currentIndex + 1), title: playlist[currentIndex + 1].title, artist: playlist[currentIndex + 1].artist }
    : null;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onPanResponderTerminationRequest: () => true,
      onPanResponderMove: (_, { dx }) => {
        const blocked = dx < 0 ? !hasNextRef.current : !hasPrevRef.current;
        translateX.setValue(blocked ? dx * 0.15 : dx);
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        const THRESHOLD = SCREEN_W * 0.3;
        if ((dx < -THRESHOLD || vx < -0.6) && hasNextRef.current) {
          const dur = Math.max(100, Math.min(250, (SCREEN_W - Math.abs(dx)) / Math.max(Math.abs(vx), 0.3)));
          Animated.timing(translateX, { toValue: -SCREEN_W, duration: dur, useNativeDriver: true })
            .start(({ finished }) => {
              if (!finished) return;
              nextFnRef.current();
              translateX.setValue(0);
            });
        } else if ((dx > THRESHOLD || vx > 0.6) && hasPrevRef.current) {
          const dur = Math.max(100, Math.min(250, (SCREEN_W - Math.abs(dx)) / Math.max(Math.abs(vx), 0.3)));
          Animated.timing(translateX, { toValue: SCREEN_W, duration: dur, useNativeDriver: true })
            .start(({ finished }) => {
              if (!finished) return;
              prevFnRef.current();
              translateX.setValue(0);
            });
        } else {
          Animated.spring(translateX, { toValue: 0, damping: 25, stiffness: 300, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, damping: 25, stiffness: 300, useNativeDriver: true }).start();
      },
    }),
  ).current;

  const renderPanel = (panel: SwiperPanel, key: string) => (
    <View key={key} style={artSwiperStyles.panel}>
      {panel?.artworkUrl ? (
        <Image source={{ uri: panel.artworkUrl }} style={artSwiperStyles.art} />
      ) : (
        <View style={[artSwiperStyles.art, artSwiperStyles.placeholder]}>
          <Text style={artSwiperStyles.placeholderText}>♪</Text>
        </View>
      )}
      <Text style={artSwiperStyles.title} numberOfLines={1}>{panel?.title ?? ''}</Text>
      <Text style={artSwiperStyles.artist} numberOfLines={1}>{panel?.artist ?? ''}</Text>
    </View>
  );

  return (
    <View style={artSwiperStyles.window} {...panResponder.panHandlers}>
      <Animated.View
        style={[
          artSwiperStyles.row,
          { transform: [{ translateX: Animated.add(translateX, new Animated.Value(-SCREEN_W)) }] },
        ]}
      >
        {renderPanel(prevPanel, 'prev')}
        {renderPanel(currentPanel, 'current')}
        {renderPanel(nextPanel, 'next')}
      </Animated.View>
    </View>
  );
}

const artSwiperStyles = StyleSheet.create({
  window: {
    width: SCREEN_W,
    overflow: 'hidden',
    marginVertical: 8,
  },
  row: {
    flexDirection: 'row',
    width: SCREEN_W * 3,
  },
  panel: {
    width: SCREEN_W,
    alignItems: 'center',
    gap: 6,
    paddingBottom: 4,
  },
  art: { width: ART_SIZE, height: ART_SIZE, borderRadius: 12 },
  placeholder: { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  placeholderText: { fontSize: 64, color: '#333' },
  title: { fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center', paddingHorizontal: 32 },
  artist: { fontSize: 15, color: '#888', textAlign: 'center', paddingHorizontal: 32 },
});

// ─── Modal ────────────────────────────────────────────────────────────────────

export function NowPlayingModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const {
    currentIndex, playlist,
    isPlaying, positionMs, durationMs,
    pause, resume, seek, next, previous,
  } = usePlayback();

  const hasTrack = currentIndex !== null;
  const hasPrevious = currentIndex !== null && currentIndex > 0;
  const hasNext = currentIndex !== null && currentIndex < playlist.length - 1;

  return (
    <SwipeSheet
      visible={visible}
      onRequestClose={onClose}
      closeDuration={300}
      dismissThreshold={80}
      dismissVelocityThreshold={0.5}
      backgroundColor="#000"
      backdropColor="rgba(0,0,0,0.45)"
      renderHeaderRight={({ dismiss }) => (
        <TouchableOpacity onPress={dismiss} style={modalStyles.collapseBtn} hitSlop={{ top: 12, bottom: 12, left: 24, right: 24 }}>
          <Text style={modalStyles.collapseIcon}>⌄</Text>
        </TouchableOpacity>
      )}
    >
      {() => (
        <>
          <View style={[modalStyles.content, { paddingBottom: insets.bottom + 24 }]}>
            <Text style={modalStyles.heading}>Now Playing</Text>

            <AlbumArtSwiper />

            <SeekBar positionMs={positionMs} durationMs={durationMs} onSeek={seek} />

            <View style={modalStyles.controls}>
              <ControlBtn label="⏮" onPress={previous} disabled={!hasPrevious} />
              <ControlBtn
                label={isPlaying ? '⏸' : '▶'}
                onPress={isPlaying ? pause : resume}
                disabled={!hasTrack}
                large
              />
              <ControlBtn label="⏭" onPress={next} disabled={!hasNext} />
            </View>

            {hasTrack && (
              <View style={modalStyles.votingPlaceholder}>
                <Text style={modalStyles.votingLabel}>VOTING</Text>
                <Text style={modalStyles.votingBody}>
                  Point allocation controls will appear here when this track is part of an active voting round.
                </Text>
              </View>
            )}
          </View>
        </>
      )}
    </SwipeSheet>
  );
}

const modalStyles = StyleSheet.create({
  collapseBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  collapseIcon: {
    fontSize: 28,
    color: '#888',
    lineHeight: 32,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    alignItems: 'center',
    gap: 20,
  },
  heading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 24, marginTop: 8 },
  votingPlaceholder: {
    width: '100%',
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: '#222',
  },
  votingLabel: { fontSize: 10, fontWeight: '800', color: '#1DB954', letterSpacing: 1.5 },
  votingBody: { fontSize: 13, color: '#555', lineHeight: 18 },
});
