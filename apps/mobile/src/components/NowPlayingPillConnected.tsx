// Wires the pure NowPlayingPill (presentation) to the PlaybackContext.
// Hidden when there is no current track. Tapping the pill opens the routed
// Now Playing screen using iOS's native zoom transition.

import { useCallback, useRef } from 'react';
import { Animated } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { armZoomTransitionToNowPlayingArt } from 'native-zoom';
import { usePlayback } from '@/playback/PlaybackContext';
import { NowPlayingPill } from '@/ui/playback/NowPlayingPill';

const NOW_PLAYING_ZOOM_SOURCE_ID = 'now-playing-pill';

export function NowPlayingPillConnected() {
  const router = useRouter();
  const scale = useRef(new Animated.Value(1)).current;
  const bounceOnReturn = useRef(false);
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
    bounceOnReturn.current = true;
    armZoomTransitionToNowPlayingArt(NOW_PLAYING_ZOOM_SOURCE_ID);
    router.push('/now-playing' as never);
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      if (!bounceOnReturn.current) return;
      bounceOnReturn.current = false;
      scale.setValue(0.98);
      Animated.spring(scale, {
        toValue: 1,
        speed: 22,
        bounciness: 12,
        useNativeDriver: true,
      }).start();
    }, [scale]),
  );

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
    </Animated.View>
  );
}
