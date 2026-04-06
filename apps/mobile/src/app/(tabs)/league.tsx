import { View, Text, StyleSheet } from 'react-native';

export default function LeagueScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>League</Text>
      <Text style={styles.body}>Rounds, submissions, and voting live here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
  },
  body: {
    fontSize: 15,
    color: '#888',
  },
});
