import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MixTabBar } from '@/ui/nav/MixTabBar';
import { NowPlayingPillConnected } from '@/components/NowPlayingPillConnected';
import { THEME } from '@/ui/theme/tokens';

export default function TabsLayout() {
  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
          sceneStyle: { backgroundColor: THEME.bg },
        }}
        tabBar={(props) => (
          <SafeAreaView
            style={styles.bottomChrome}
            edges={['bottom']}
            pointerEvents="box-none"
          >
            <View style={styles.chromeStack} pointerEvents="box-none">
              <NowPlayingPillConnected />
              <MixTabBar {...props} />
            </View>
          </SafeAreaView>
        )}
      >
        <Tabs.Screen name="(home)" options={{ title: 'Home' }} />
        <Tabs.Screen name="mix" options={{ title: 'Mix' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  bottomChrome: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: 6,
  },
  chromeStack: { gap: 8 },
});
