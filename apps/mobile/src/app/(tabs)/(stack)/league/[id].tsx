import { useLocalSearchParams } from 'expo-router';
import { LeagueScreen } from '@/screens/league/LeagueScreen';

export default function LeaguePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LeagueScreen leagueId={id} />;
}
