import { useLocalSearchParams } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { SeasonScreen } from '@/screens/season/SeasonScreen';

export default function SeasonPage() {
  const { id, leagueId } = useLocalSearchParams<{ id: string; leagueId: string }>();

  if (!id) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>Missing season ID.</Text>
      </View>
    );
  }

  return <SeasonScreen seasonId={id} leagueId={leagueId} />;
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  error: { color: '#555', fontSize: 15 },
});
