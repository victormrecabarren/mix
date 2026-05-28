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
  currentIndex: number | null;

  // Now-playing (live)
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  artworkUrl: string;
  title: string;
  artist: string;

  // Commands
  playPlaylist: (tracks: PlaylistTrack[], startIndex?: number) => void;
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
  currentIndex: null,
  isPlaying: false,
  positionMs: 0,
  durationMs: 0,
  artworkUrl: '',
  title: '',
  artist: '',
  playPlaylist: () => {},
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

  // ── Auto-advance on track end ──────────────────────────────────────────────

  const trackEndFiredRef = useRef(false);
  // Highest extrapolated position seen during continuous playback of the
  // current track. Used to disambiguate "Spotify reset position to 0 because
  // the track ended" from "user paused at position 0".
  const peakPositionRef = useRef(0);

  useEffect(() => {
    trackEndFiredRef.current = false;
    peakPositionRef.current = 0;
  }, [currentIndex]);

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

  // Mirror playlist into a ref so command callbacks always see the latest
  // tracks, even when invoked from a stale closure (e.g. setTimeout) or from
  // the same tick as a setPlaylist call.
  const playlistRef = useRef<PlaylistTrack[]>(playlist);
  playlistRef.current = playlist;

  // Internal: actually start a track. Always interrupts whatever is playing.
  const startTrack = useCallback((tracks: PlaylistTrack[], index: number) => {
    const track = tracks[index];
    if (!track) return;

    // Reset auto-advance guard for the new track
    trackEndFiredRef.current = false;

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
  }, [spotify, sc]);

  // Public: load a playlist and immediately start a track from it.
  // Use this from screens — it synchronously sets the playlist and kicks off
  // playback in one operation, avoiding any stale-closure timing issues.
  const playPlaylist = useCallback(
    (tracks: PlaylistTrack[], startIndex: number = 0) => {
      setPlaylist(tracks);
      startTrack(tracks, startIndex);
    },
    [startTrack],
  );

  // Public: play a track by index within the currently-loaded playlist.
  // Used internally by next/previous and from the Now Playing UI.
  const playTrack = useCallback((index: number) => {
    startTrack(playlistRef.current, index);
  }, [startTrack]);

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
    // A fresh seek is a new track-end window — clear the auto-advance guard
    // so it can re-arm against the new position. Reset the peak too so
    // seeking *back* from near the end doesn't leave the natural-end
    // detector primed to fire if the user then pauses near position 0.
    trackEndFiredRef.current = false;
    peakPositionRef.current = ms;
    if (activeSource === 'spotify') {
      // Re-anchor the extrapolation base to the new seek position so the
      // 500ms interval doesn't overwrite displayPositionMs with a stale
      // extrapolation of the OLD position (which can race past durationMs
      // and spuriously trigger auto-advance).
      spotifyPosRef.current = {
        positionMs: ms,
        timestamp: Date.now(),
        playing: spotifyPosRef.current.playing,
      };
      spotify.seek(ms);
    } else if (activeSource === 'soundcloud') {
      sc.seek(ms);
    }
  }, [activeSource, spotify, sc]);

  const next = useCallback(() => {
    if (currentIndex === null) return;
    if (currentIndex >= playlistRef.current.length - 1) return;
    playTrack(currentIndex + 1);
  }, [currentIndex, playTrack]);

  // Standard music-player back behavior: tapping back restarts the current
  // track from 0, *unless* you tap within the first 2s — in that case it
  // jumps to the previous track. If you're at the first track and >2s in,
  // tapping back also restarts from 0 (no previous to go to).
  const PREV_TO_RESTART_THRESHOLD_MS = 2000;
  const previous = useCallback(() => {
    if (currentIndex === null) return;
    const atStartWindow = displayPositionMs <= PREV_TO_RESTART_THRESHOLD_MS;
    const hasPrevTrack = currentIndex > 0;
    if (atStartWindow && hasPrevTrack) {
      playTrack(currentIndex - 1);
      return;
    }
    // Restart current track from 0 (works for both sources via seek()).
    seek(0);
  }, [currentIndex, displayPositionMs, playTrack, seek]);

  // Keep a ref so subscription callbacks always see the latest `next`
  const nextRef = useRef(next);
  nextRef.current = next;

  // Track the highest extrapolated position seen while the current track is
  // actively playing. Only grows monotonically — explicit seeks reset it (see
  // the seek() command above).
  useEffect(() => {
    if (activeSource !== 'spotify') return;
    if (!isPlaying) return;
    if (displayPositionMs > peakPositionRef.current) {
      peakPositionRef.current = displayPositionMs;
    }
  }, [displayPositionMs, isPlaying, activeSource]);

  // Spotify natural-end detection. Two signals — whichever fires first:
  //   1. Extrapolated position runs past durationMs while still "playing".
  //      Happens when Spotify stops firing stateChanged at the very end.
  //   2. Spotify reports paused + position ≈ 0 *after* we'd been playing near
  //      the end. That's Spotify's natural-end signature (it resets position
  //      to 0). We use the peak-position guard to distinguish this from the
  //      user pausing at the start of the track.
  useEffect(() => {
    if (activeSource !== 'spotify') return;
    if (durationMs <= 0) return;
    if (trackEndFiredRef.current) return;

    const passedEndWhilePlaying =
      isPlaying && displayPositionMs >= durationMs;

    const wasNearEnd = peakPositionRef.current >= durationMs - 3000;
    const positionResetAfterPlaying =
      !isPlaying && wasNearEnd && displayPositionMs < 1500;

    if (passedEndWhilePlaying || positionResetAfterPlaying) {
      trackEndFiredRef.current = true;
      nextRef.current();
    }
  }, [displayPositionMs, durationMs, isPlaying, activeSource]);

  // SoundCloud: FINISH event fired from the widget
  useEffect(() => {
    return sc.subscribeTrackEnd(() => {
      if (activeSourceRef.current !== 'soundcloud') return;
      nextRef.current();
    });
  }, [sc]);

  return (
    <PlaybackContext.Provider value={{
      playlist,
      currentIndex,
      isPlaying,
      positionMs: displayPositionMs,
      durationMs,
      artworkUrl,
      title,
      artist,
      playPlaylist,
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
