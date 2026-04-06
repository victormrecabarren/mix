export interface TrackInfo {
  spotifyTrackId?: string;
  appleMusicTrackId?: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  durationMs?: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTrack: TrackInfo | null;
  positionMs: number;
  durationMs: number;
  isConnected: boolean;
}

export interface PlaybackProvider {
  /** Connect / initialize the provider. Call on app launch after auth. */
  connect(accessToken: string): Promise<void>;
  /** Disconnect and clean up. */
  disconnect(): Promise<void>;
  /** Play a track by its platform-specific ID. */
  play(trackId: string): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seekTo(positionMs: number): Promise<void>;
  /** Subscribe to playback state changes. Returns unsubscribe function. */
  onStateChange(callback: (state: PlaybackState) => void): () => void;
}
