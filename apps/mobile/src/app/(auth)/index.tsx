import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';

export default function AuthScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>mix</Text>
      <Text style={styles.subtitle}>music. compete. discover.</Text>

      <TouchableOpacity
        style={[styles.button, styles.spotifyButton]}
        onPress={() => {
          // TODO: Phase 1 — Spotify PKCE OAuth flow
          console.log('Spotify login pressed');
        }}
      >
        <Text style={styles.buttonText}>Continue with Spotify</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.appleButton]}
        onPress={() => {
          // TODO: Phase 1 — Apple Music auth (iOS only)
          console.log('Apple Music login pressed');
        }}
      >
        <Text style={styles.buttonText}>Continue with Apple Music</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 64,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -2,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginBottom: 40,
  },
  button: {
    width: '100%',
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotifyButton: {
    backgroundColor: '#1DB954',
  },
  appleButton: {
    backgroundColor: '#FC3C44',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
