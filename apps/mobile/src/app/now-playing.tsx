import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { NowPlayingContent } from '@/components/NowPlayingModal';

export default function NowPlayingRoute() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <NowPlayingContent onClose={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#EDD7FF',
  },
});
