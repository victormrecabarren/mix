import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { NowPlayingBar } from '@/components/NowPlayingBar';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#111', borderTopColor: '#222' },
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: '#555',
      }}
      tabBar={(props) => (
        <View>
          <NowPlayingBar />
          <BottomTabBar {...props} />
        </View>
      )}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="league" options={{ title: 'Play' }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="(stack)" options={{ href: null }} />
    </Tabs>
  );
}
