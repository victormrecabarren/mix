import { useLocalSearchParams } from 'expo-router';
import { RoundScreen } from '@/screens/round/RoundScreen';

export default function RoundPage() {
  const { id, seasonId } = useLocalSearchParams<{ id: string; seasonId: string }>();
  return <RoundScreen roundId={id} seasonId={seasonId} />;
}
