import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { normalizeSpotifyTrackUri } from '@/lib/spotifyTrackUri';
import { useSpotifyPlayer } from './SpotifyWebPlayer';
import { useSoundCloudPlayer } from './SoundCloudWebPlayer';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlaylistTrack {
  id: string;
  source: 'spotify' | 'soundcloud';
  uri: string;
  title: string;
  artist: string;
  artworkUrl: string;
  durationMs: number;
}

interface PlaybackContextValue {
  // Playlist
  playlist: PlaylistTrack[];
  setPlaylist: (tracks: PlaylistTrack[]) => void;
  currentIndex: number | null;

  // Now-playing (live)
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  artworkUrl: string;
  title: string;
  artist: string;

  // Commands
  playTrack: (index: number) => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  previous: () => void;
  seek: (ms: number) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const PlaybackContext = createContext<PlaybackContextValue>({
  playlist: [],
  setPlaylist: () => {},
  currentIndex: null,
  isPlaying: false,
  positionMs: 0,
  durationMs: 0,
  artworkUrl: '',
  title: '',
  artist: '',
  playTrack: () => {},
  pause: () => {},
  resume: () => {},
  next: () => {},
  previous: () => {},
  seek: () => {},
});

export function usePlayback() {
  return useContext(PlaybackContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function PlaybackProvider({ children }: { children: React.ReactNode }) {
  const spotify = useSpotifyPlayer();
  const sc = useSoundCloudPlayer();

  const [playlist, setPlaylist] = useState<PlaylistTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [activeSource, setActiveSource] = useState<'spotify' | 'soundcloud' | null>(null);
  const activeSourceRef = useRef<'spotify' | 'soundcloud' | null>(null);
  activeSourceRef.current = activeSource;

  const currentTrack = currentIndex !== null ? playlist[currentIndex] : null;

  const spotifyLiveMatchesPlaylist =
    activeSource === 'spotify' &&
    currentTrack?.source === 'spotify' &&
    !!spotify.trackState?.trackUri &&
    normalizeSpotifyTrackUri(spotify.trackState.trackUri) ===
      normalizeSpotifyTrackUri(currentTrack.uri);

  // Smooth position for Spotify (state changes are infrequent; extrapolate between them)
  const spotifyPosRef = useRef({ positionMs: 0, timestamp: 0, playing: false });
  const [displayPositionMs, setDisplayPositionMs] = useState(0);

  // ── Sync Spotify state ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!spotify.trackState || !spotifyLiveMatchesPlaylist) return;
    spotifyPosRef.current = {
      positionMs: spotify.trackState.positionMs,
      timestamp: Date.now(),
      playing: !spotify.trackState.isPaused,
    };
    setDisplayPositionMs(spotify.trackState.positionMs);
  }, [spotify.trackState, spotifyLiveMatchesPlaylist]);

  useEffect(() => {
    if (!spotifyLiveMatchesPlaylist) {
      spotifyPosRef.current = { ...spotifyPosRef.current, playing: false };
    }
  }, [spotifyLiveMatchesPlaylist]);

  // ── Sync SoundCloud state ──────────────────────────────────────────────────
  useEffect(() => {
    if (activeSource === 'soundcloud' && sc.trackState) {
      setDisplayPositionMs(sc.trackState.currentPosition);
    }
  }, [activeSource, sc.trackState?.currentPosition]);

  // ── 500ms interval to extrapolate Spotify position ────────────────────────
  useEffect(() => {
    if (activeSource !== 'spotify') return;
    const id = setInterval(() => {
      const { positionMs, timestamp, playing } = spotifyPosRef.current;
      if (!playing) return;
      const estimated = positionMs + (Date.now() - timestamp);
      setDisplayPositionMs(estimated);
    }, 500);
    return () => clearInterval(id);
  }, [activeSource]);

  // External Spotify client took over — reset Now Playing to empty state.
  // Player reconnects in background; user picks a track from the playlist to resume.
  useEffect(() => {
    return spotify.subscribeExternalTakeover(() => {
      if (activeSourceRef.current !== 'spotify') return;
      setCurrentIndex(null);
      setActiveSource(null);
      setDisplayPositionMs(0);
    });
  }, [spotify]);

  // ── Derived now-playing values ─────────────────────────────────────────────
  const isPlaying = activeSource === 'spotify'
    ? !!(
        spotify.trackState &&
        !spotify.trackState.isPaused &&
        spotifyLiveMatchesPlaylist
      )
    : activeSource === 'soundcloud'
    ? !!(sc.trackState && !sc.trackState.isPaused)
    : false;

  const durationMs = activeSource === 'spotify'
    ? spotifyLiveMatchesPlaylist
      ? (spotify.trackState?.durationMs ?? currentTrack?.durationMs ?? 0)
      : (currentTrack?.durationMs ?? 0)
    : activeSource === 'soundcloud'
    ? (sc.trackState?.duration ?? currentTrack?.durationMs ?? 0)
    : 0;

  const artworkUrl = activeSource === 'spotify'
    ? spotifyLiveMatchesPlaylist
      ? spotify.trackState?.artworkUrl || currentTrack?.artworkUrl || ''
      : currentTrack?.artworkUrl || ''
    : activeSource === 'soundcloud'
    ? (sc.trackState?.artworkUrl || currentTrack?.artworkUrl || '')
    : '';

  const title = activeSource === 'spotify'
    ? spotifyLiveMatchesPlaylist
      ? spotify.trackState?.trackName || currentTrack?.title || ''
      : currentTrack?.title || ''
    : activeSource === 'soundcloud'
    ? (sc.trackState?.trackTitle || currentTrack?.title || '')
    : '';

  const artist = activeSource === 'spotify'
    ? spotifyLiveMatchesPlaylist
      ? spotify.trackState?.artistName || currentTrack?.artist || ''
      : currentTrack?.artist || ''
    : activeSource === 'soundcloud'
    ? (sc.trackState?.artistName || currentTrack?.artist || '')
    : '';

  // ── Commands ───────────────────────────────────────────────────────────────

  const playTrack = useCallback((index: number) => {
    const track = playlist[index];
    if (!track) return;
    setCurrentIndex(index);
    setActiveSource(track.source);
    setDisplayPositionMs(0);

    if (track.source === 'spotify') {
      if (sc.trackState && !sc.trackState.isPaused) sc.pause();
      void spotify.play(track.uri);
    } else {
      spotify.abandonMixSpotifySession();
      sc.load(track.uri);
    }
  }, [playlist, spotify, sc]);

  const pause = useCallback(() => {
    if (activeSource === null) return;
    if (activeSource === 'spotify') spotify.pause();
    else if (activeSource === 'soundcloud') sc.pause();
  }, [activeSource, spotify, sc]);

  const resume = useCallback(() => {
    if (activeSource === null) return;
    if (activeSource === 'spotify') {
      if (currentIndex === null) return;
      const track =
        currentIndex !== null ? playlist[currentIndex] : undefined;
      if (track?.source === 'spotify') {
        const webStateMatchesRow =
          spotify.isReady &&
          !!spotify.trackState?.trackUri &&
          normalizeSpotifyTrackUri(spotify.trackState.trackUri) ===
            normalizeSpotifyTrackUri(track.uri);
        if (!webStateMatchesRow) {
          void spotify.play(track.uri);
          return;
        }
        if (spotify.trackState?.isPaused) {
          spotify.resume();
          return;
        }
        void spotify.play(track.uri);
      }
      spotify.resume();
    } else if (activeSource === 'soundcloud') {
      sc.play();
    }
  }, [activeSource, currentIndex, playlist, spotify, sc]);

  const seek = useCallback((ms: number) => {
    if (activeSource === null) return;
    setDisplayPositionMs(ms);
    if (activeSource === 'spotify') spotify.seek(ms);
    else if (activeSource === 'soundcloud') sc.seek(ms);
  }, [activeSource, spotify, sc]);

  const next = useCallback(() => {
    if (currentIndex === null || currentIndex >= playlist.length - 1) return;
    playTrack(currentIndex + 1);
  }, [currentIndex, playlist.length, playTrack]);

  const previous = useCallback(() => {
    if (currentIndex === null || currentIndex <= 0) return;
    playTrack(currentIndex - 1);
  }, [currentIndex, playTrack]);

  return (
    <PlaybackContext.Provider value={{
      playlist,
      setPlaylist,
      currentIndex,
      isPlaying,
      positionMs: displayPositionMs,
      durationMs,
      artworkUrl,
      title,
      artist,
      playTrack,
      pause,
      resume,
      next,
      previous,
      seek,
    }}>
      {children}
    </PlaybackContext.Provider>
  );
}
