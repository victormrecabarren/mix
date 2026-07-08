// Wires the pure NowPlayingPill (presentation) to the PlaybackContext.
// Hidden when there is no current track. Tapping the pill opens the in-tree
// Now Playing sheet so album-art swipes do not conflict with native stack
// back/zoom gestures.

import { useCallback, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { usePlayback } from '@/playback/PlaybackContext';
import { NowPlayingModal } from '@/components/NowPlayingModal';
import { NowPlayingPill } from '@/ui/playback/NowPlayingPill';

const NOW_PLAYING_ZOOM_SOURCE_ID = 'now-playing-pill';

export function NowPlayingPillConnected() {
  const scale = useRef(new Animated.Value(1)).current;
  const [expanded, setExpanded] = useState(false);
  const {
    currentIndex,
    playlist,
    isPlaying,
    title,
    artist,
    artworkUrl,
    pause,
    resume,
    next,
    previous,
  } = usePlayback();

  const hasNext = currentIndex !== null && currentIndex < playlist.length - 1;
  const hasPrevious = currentIndex !== null && currentIndex > 0;
  const openNowPlaying = useCallback(() => {
    setExpanded(true);
  }, []);

  const closeNowPlaying = useCallback(() => {
    setExpanded(false);
    scale.setValue(0.98);
    Animated.spring(scale, {
      toValue: 1,
      speed: 22,
      bounciness: 12,
      useNativeDriver: true,
    }).start();
  }, [scale]);

  if (currentIndex === null) return null;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <NowPlayingPill
        title={title || 'Loading…'}
        artist={artist || undefined}
        artworkUrl={artworkUrl || undefined}
        isPlaying={isPlaying}
        onPlayPause={isPlaying ? pause : resume}
        onNext={hasNext ? next : undefined}
        onPrevious={hasPrevious ? previous : undefined}
        onPress={openNowPlaying}
        zoomSourceId={NOW_PLAYING_ZOOM_SOURCE_ID}
      />
      <NowPlayingModal visible={expanded} onClose={closeNowPlaying} />
    </Animated.View>
  );
}
