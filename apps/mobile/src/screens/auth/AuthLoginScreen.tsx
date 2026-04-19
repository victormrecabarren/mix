import { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { loginWithSpotify, getValidAccessToken } from '@/lib/spotifyAuth';
import { signInToSupabase } from '@/lib/supabaseAuth';
import { useSession } from '@/context/SessionContext';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export function AuthLoginScreen() {
  const [loading, setLoading] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { refresh } = useSession();

  const handleTitleTap = () => {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => { tapCount.current = 0; }, 1500);
    if (tapCount.current >= 5) {
      tapCount.current = 0;
      setDevMode((v) => !v);
    }
  };

  const handleSpotifyLogin = async () => {
    setLoading(true);
    try {
      await loginWithSpotify();
      const token = await getValidAccessToken();
      if (token) await signInToSupabase(token);
      await refresh();
    } catch (err) {
      Alert.alert('Login failed', err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleDevLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await refresh();
    } catch (err) {
      Alert.alert('Login failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <TouchableOpacity onPress={handleTitleTap} activeOpacity={1}>
        <Text style={styles.title}>mix</Text>
      </TouchableOpacity>

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

      {devMode && (
        <View style={styles.devBox}>
          <Text style={styles.devLabel}>DEV LOGIN</Text>
          <TextInput
            style={styles.devInput}
            placeholder="email"
            placeholderTextColor="#555"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.devInput}
            placeholder="password"
            placeholderTextColor="#555"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TouchableOpacity
            style={[styles.devBtn, loading && styles.buttonBusy]}
            onPress={handleDevLogin}
            disabled={loading}
          >
            <Text style={styles.devBtnLabel}>Sign In</Text>
          </TouchableOpacity>
        </View>
      )}
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
  devBox: {
    width: '100%',
    maxWidth: 320,
    gap: 10,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#0a0a0a',
  },
  devLabel: { fontSize: 10, fontWeight: '800', color: '#555', letterSpacing: 1.5 },
  devInput: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 12,
    color: '#fff',
    fontSize: 14,
  },
  devBtn: {
    height: 44,
    borderRadius: 8,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  devBtnLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
