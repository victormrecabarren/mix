import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { loginWithSpotify } from '@/lib/spotifyAuth';
import { useSession } from '@/context/SessionContext';

WebBrowser.maybeCompleteAuthSession();

export function AuthLoginScreen() {
  const [loading, setLoading] = useState(false);
  const { refresh } = useSession();

  const handleSpotifyLogin = async () => {
    setLoading(true);
    try {
      await loginWithSpotify();
      await refresh();
    } catch (err) {
      Alert.alert('Login failed', err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>mix</Text>
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonBusy]}
        onPress={handleSpotifyLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonLabel}>Continue with Spotify</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 24,
  },
  title: {
    fontSize: 48,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -2,
  },
  button: {
    width: '100%',
    maxWidth: 320,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1DB954',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonBusy: { opacity: 0.7 },
  buttonLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
