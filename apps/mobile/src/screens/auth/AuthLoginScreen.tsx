import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, TextInput, KeyboardAvoidingView, Platform, ScrollView, Linking,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Clipboard from 'expo-clipboard';
import { loginWithSpotify, getValidAccessToken, getClientId, saveClientId } from '@/lib/spotifyAuth';
import { signInToSupabase } from '@/lib/supabaseAuth';
import { useSession } from '@/context/SessionContext';

WebBrowser.maybeCompleteAuthSession();

// ─── Step 1: Client ID setup ──────────────────────────────────────────────────

const REDIRECT_URI = 'mix://auth/callback';

function ClientIdSetup({ onSaved }: { onSaved: () => void }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await saveClientId(trimmed);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const copyRedirectUri = async () => {
    await Clipboard.setStringAsync(REDIRECT_URI);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>mix</Text>

        <View style={styles.setupCard}>
          <Text style={styles.setupHeading}>One-time setup</Text>

          <View style={styles.step}>
            <Text style={styles.stepLabel}>1. Open Spotify Developer Dashboard</Text>
            <TouchableOpacity onPress={() => Linking.openURL('https://developer.spotify.com/dashboard')}>
              <Text style={styles.setupLink}>developer.spotify.com/dashboard →</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.step}>
            <Text style={styles.stepLabel}>2. Create an app — under "APIs used" select <Text style={styles.stepEmphasis}>Web Playback SDK</Text></Text>
          </View>

          <View style={styles.step}>
            <Text style={styles.stepLabel}>3. Add this as a Redirect URI (tap to copy)</Text>
            <TouchableOpacity style={styles.copyRow} onPress={copyRedirectUri}>
              <Text style={styles.setupCode}>{REDIRECT_URI}</Text>
              <Text style={styles.copyHint}>{copied ? '✓ Copied' : 'Copy'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.step}>
            <Text style={styles.stepLabel}>4. Paste your Client ID below</Text>
            <TextInput
              style={styles.clientIdInput}
              placeholder="Paste Client ID here"
              placeholderTextColor="#555"
              value={value}
              onChangeText={setValue}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, (!value.trim() || saving) && styles.buttonBusy]}
            onPress={handleSave}
            disabled={!value.trim() || saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonLabel}>Save & Continue</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Step 2: Spotify login ────────────────────────────────────────────────────

function SpotifyLogin({ onReset }: { onReset: () => void }) {
  const [loading, setLoading] = useState(false);
  const { refresh } = useSession();

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

  return (
    <View style={styles.root}>
      <Text style={styles.title}>mix</Text>
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonBusy]}
        onPress={handleSpotifyLogin}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonLabel}>Continue with Spotify</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={onReset}>
        <Text style={styles.resetLink}>Change client ID</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function AuthLoginScreen() {
  const [checked, setChecked] = useState(false);
  const [hasClientId, setHasClientId] = useState(false);

  useEffect(() => {
    getClientId().then((id) => {
      setHasClientId(!!id);
      setChecked(true);
    });
  }, []);

  if (!checked) {
    return (
      <View style={[styles.root, { justifyContent: 'center' }]}>
        <ActivityIndicator color="#555" />
      </View>
    );
  }

  if (!hasClientId) {
    return <ClientIdSetup onSaved={() => setHasClientId(true)} />;
  }

  return <SpotifyLogin onReset={() => setHasClientId(false)} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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

  // Setup card
  setupCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 24,
    gap: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  setupHeading: { fontSize: 17, fontWeight: '700', color: '#fff' },
  setupLink: { fontSize: 13, color: '#1DB954' },
  setupCode: { fontSize: 13, color: '#ccc', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', flexShrink: 1 },

  step: { gap: 6 },
  stepLabel: { fontSize: 13, color: '#888', lineHeight: 18 },
  stepEmphasis: { color: '#fff', fontWeight: '600' },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#000',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  copyHint: { fontSize: 12, color: '#1DB954', fontWeight: '600', marginLeft: 8 },

  clientIdInput: {
    backgroundColor: '#000',
    borderRadius: 10,
    padding: 14,
    fontSize: 13,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Shared button
  button: {
    width: '100%',
    maxWidth: 320,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1DB954',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonBusy: { opacity: 0.4 },
  buttonLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },

  resetLink: { fontSize: 13, color: '#444', marginTop: -8 },
});
