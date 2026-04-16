import { useLocalSearchParams } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { JoinScreen } from '@/screens/join/JoinScreen';

export default function JoinPage() {
  const { token } = useLocalSearchParams<{ token?: string }>();

  if (!token) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>Missing invite token.</Text>
      </View>
    );
  }

  return <JoinScreen token={token} />;
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  error: { color: '#555', fontSize: 15 },
});
