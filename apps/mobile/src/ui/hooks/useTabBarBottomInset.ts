// Bottom inset for screens to reserve under the floating tab bar + pill.
// Screens should add this to scroll content padding so nothing hides
// behind the floating chrome.

import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Visual height of the tab bar pill (matches MixTabBar layout). */
export const TAB_BAR_HEIGHT = 56;

/** Visual height of the now-playing pill (matches NowPlayingPill layout). */
export const NOW_PLAYING_PILL_HEIGHT = 60;

/** Gap between the now-playing pill and the tab bar. */
export const FLOATING_CHROME_GAP = 8;

/** Extra breathing room above the topmost floating element. */
export const FLOATING_CHROME_TOP_PAD = 8;

export function useTabBarBottomInset(opts?: { withNowPlaying?: boolean }) {
  const insets = useSafeAreaInsets();
  const withNowPlaying = opts?.withNowPlaying ?? true;
  return (
    insets.bottom +
    TAB_BAR_HEIGHT +
    (withNowPlaying ? NOW_PLAYING_PILL_HEIGHT + FLOATING_CHROME_GAP : 0) +
    FLOATING_CHROME_TOP_PAD
  );
}
