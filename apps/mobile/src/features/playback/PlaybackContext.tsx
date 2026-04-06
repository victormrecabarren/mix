import React, { createContext, useContext, useRef, useState } from 'react';
import type { PlaybackProvider, PlaybackState } from './types';

interface PlaybackContextValue {
  provider: PlaybackProvider | null;
  setProvider: (provider: PlaybackProvider | null) => void;
  playbackState: PlaybackState;
}

const defaultState: PlaybackState = {
  isPlaying: false,
  currentTrack: null,
  positionMs: 0,
  durationMs: 0,
  isConnected: false,
};

const PlaybackContext = createContext<PlaybackContextValue>({
  provider: null,
  setProvider: () => {},
  playbackState: defaultState,
});

export function PlaybackProvider({ children }: { children: React.ReactNode }) {
  const [provider, setProviderState] = useState<PlaybackProvider | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(defaultState);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const setProvider = (newProvider: PlaybackProvider | null) => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    if (newProvider) {
      unsubscribeRef.current = newProvider.onStateChange(setPlaybackState);
    } else {
      setPlaybackState(defaultState);
    }
    setProviderState(newProvider);
  };

  return (
    <PlaybackContext.Provider value={{ provider, setProvider, playbackState }}>
      {children}
    </PlaybackContext.Provider>
  );
}

export function usePlayback() {
  return useContext(PlaybackContext);
}
