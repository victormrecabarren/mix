import { useLocalSearchParams } from 'expo-router';
import { PlaylistScreen } from '@/screens/playlist/PlaylistScreen';

export default function PlaylistPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlaylistScreen roundId={id} />;
}
