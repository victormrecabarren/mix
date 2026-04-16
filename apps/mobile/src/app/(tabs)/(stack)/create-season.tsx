import { useLocalSearchParams } from 'expo-router';
import { CreateSeasonFlow } from '@/screens/create-season/CreateSeasonFlow';

export default function CreateSeasonPage() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  return <CreateSeasonFlow leagueId={leagueId} />;
}
