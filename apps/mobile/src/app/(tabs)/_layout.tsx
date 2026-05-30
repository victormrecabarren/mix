import {
  NativeTabs,
  NativeTabTrigger,
} from 'expo-router/unstable-native-tabs';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NowPlayingPillConnected } from '@/components/NowPlayingPillConnected';
import { THEME } from '@/ui/theme/tokens';
import {
  FLOATING_CHROME_GAP,
  NATIVE_TAB_BAR_HEIGHT,
} from '@/ui/nav/floatingChromeMetrics';

const ACTIVE_RED = '#FC3C44';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <NativeTabs tintColor={ACTIVE_RED}>
        <NativeTabTrigger
          name="(home)"
          options={{
            title: 'Home',
            icon: { sf: 'house.fill' },
          }}
        />
        <NativeTabTrigger
          name="mix"
          options={{
            title: 'Mix',
            icon: { sf: 'music.note' },
          }}
        />
        <NativeTabTrigger
          name="activity"
          options={{
            title: 'Activity',
            icon: { sf: 'chart.bar.fill' },
          }}
        />
        <NativeTabTrigger
          name="profile"
          options={{
            title: 'Profile',
            icon: { sf: 'person.fill' },
          }}
        />
        <NativeTabTrigger
          name="search"
          options={{
            title: 'Search',
            icon: { sf: 'magnifyingglass' },
          }}
        />
      </NativeTabs>

      <View
        style={[
          styles.pillOverlay,
          {
            bottom:
              NATIVE_TAB_BAR_HEIGHT + insets.bottom + FLOATING_CHROME_GAP,
          },
        ]}
        pointerEvents="box-none"
      >
        <NowPlayingPillConnected />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  pillOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
