import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { NocturneTabBar } from '@/components/nocturne/NocturneTabBar';

export default function TabsLayout() {
  return (
    // Black wrapper so any exposed area during stack push/pop animations
    // shows black instead of white.
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { position: 'absolute', backgroundColor: 'transparent', borderTopWidth: 0, elevation: 0 },
          sceneStyle: { backgroundColor: '#000' },
        }}
        tabBar={(props) => <NocturneTabBar {...props} />}
      >
        <Tabs.Screen name="(home)"  options={{ title: 'Home' }} />
        <Tabs.Screen name="mix"     options={{ title: 'Mix' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>
    </View>
  );
}
