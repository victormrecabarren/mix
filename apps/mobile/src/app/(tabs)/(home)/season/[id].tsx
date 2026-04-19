import { useLocalSearchParams } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { SeasonScreen } from '@/screens/season/SeasonScreen';
import { colors } from '@/theme/colors';

export default function SeasonPage() {
  const params = useLocalSearchParams<{
    id: string;
    initialTab?: string;
    initialName?: string;
    initialNumber?: string;
    initialStatus?: string;
    initialLeagueName?: string;
  }>();

  if (!params.id) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>Missing season ID.</Text>
      </View>
    );
  }

  return (
    <SeasonScreen
      seasonId={params.id}
      initialTab={params.initialTab === 'standings' ? 'standings' : undefined}
      initialName={params.initialName}
      initialNumber={params.initialNumber ? Number(params.initialNumber) : undefined}
      initialStatus={params.initialStatus}
      initialLeagueName={params.initialLeagueName}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.textMuted, fontSize: 15 },
});
