// Wires the pure NowPlayingPill (presentation) to the PlaybackContext.
// Hidden when there is no current track. Tapping the pill opens the full
// Now Playing modal extracted into NowPlayingModal.tsx.

import { useState } from 'react';
import { usePlayback } from '@/playback/PlaybackContext';
import { NowPlayingPill } from '@/ui/playback/NowPlayingPill';
import { NowPlayingModal } from '@/components/NowPlayingModal';

export function NowPlayingPillConnected() {
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
  const [expanded, setExpanded] = useState(false);

  if (currentIndex === null) return null;

  const hasNext = currentIndex < playlist.length - 1;
  const hasPrevious = currentIndex > 0;

  return (
    <>
      <NowPlayingPill
        title={title || 'Loading…'}
        artist={artist || undefined}
        artworkUrl={artworkUrl || undefined}
        isPlaying={isPlaying}
        onPlayPause={isPlaying ? pause : resume}
        onNext={hasNext ? next : undefined}
        onPrevious={hasPrevious ? previous : undefined}
        onPress={() => setExpanded(true)}
      />
      <NowPlayingModal visible={expanded} onClose={() => setExpanded(false)} />
    </>
  );
}
