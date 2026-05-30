// Bottom inset for screens to reserve under the floating tab bar + pill.
// Screens should add this to scroll content padding so nothing hides
// behind the floating chrome.

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FLOATING_CHROME_GAP,
  FLOATING_CHROME_TOP_PAD,
  NATIVE_TAB_BAR_HEIGHT,
  NOW_PLAYING_PILL_HEIGHT,
} from '@/ui/nav/floatingChromeMetrics';

export function useTabBarBottomInset(opts?: { withNowPlaying?: boolean }) {
  const insets = useSafeAreaInsets();
  const withNowPlaying = opts?.withNowPlaying ?? true;
  return (
    insets.bottom +
    NATIVE_TAB_BAR_HEIGHT +
    (withNowPlaying ? NOW_PLAYING_PILL_HEIGHT + FLOATING_CHROME_GAP : 0) +
    FLOATING_CHROME_TOP_PAD
  );
}
