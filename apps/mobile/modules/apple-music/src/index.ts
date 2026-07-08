import { requireNativeModule } from "expo";

export type AppleMusicAuthStatus =
  | "authorized"
  | "denied"
  | "restricted"
  | "notDetermined"
  | "unknown";

export interface AppleMusicStateEvent {
  isPaused: boolean;
  currentPosition: number; // ms
  duration: number; // ms
  trackTitle: string;
  artistName: string;
  artworkUrl: string;
}

export interface AppleMusicSubscription {
  canPlayCatalogContent: boolean;
  canBecomeSubscriber: boolean;
}

interface EventSubscription {
  remove(): void;
}

interface AppleMusicNativeModule {
  requestAuthorization(): Promise<AppleMusicAuthStatus>;
  getAuthorizationStatus(): AppleMusicAuthStatus;
  checkSubscription(): Promise<AppleMusicSubscription>;
  // isrc is an optional fallback: if the catalog id doesn't resolve in the
  // device's storefront, the native module re-resolves the recording by ISRC.
  play(catalogId: string, isrc?: string): Promise<void>;
  resume(): Promise<void>;
  pause(): void;
  seek(positionMs: number): void;
  stop(): void;
  addListener(
    event: "onStateChange",
    listener: (e: AppleMusicStateEvent) => void,
  ): EventSubscription;
  addListener(event: "onTrackEnd", listener: () => void): EventSubscription;
}

// iOS-only native module. Calls will throw a missing-module error on platforms
// where it isn't built (Android), so gate usage on Platform.OS === 'ios'.
const AppleMusic = requireNativeModule<AppleMusicNativeModule>("AppleMusic");

export default AppleMusic;
