import { useLocalSearchParams } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { SeasonScreen } from '@/screens/season/SeasonScreen';
import { colors } from '@/theme/colors';

export default function SeasonPage() {
  const { id, initialTab } = useLocalSearchParams<{ id: string; initialTab: string }>();

  if (!id) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>Missing season ID.</Text>
      </View>
    );
  }

  return <SeasonScreen seasonId={id} initialTab={initialTab === 'standings' ? 'standings' : undefined} />;
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.textMuted, fontSize: 15 },
});
