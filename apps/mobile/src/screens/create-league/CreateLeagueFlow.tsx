import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { KeyboardScroll } from '@/components/KeyboardScroll';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

type PlaylistMode = 'fresh' | 'cloned' | 'linked';

type LeagueForm = {
  name: string;
  playlistMode: PlaylistMode;
  playlistRef: string;
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
      {children}
    </View>
  );
}

export function CreateLeagueFlow() {
  const router = useRouter();
  const [form, setForm] = useState<LeagueForm>({ name: '', playlistMode: 'fresh', playlistRef: '' });
  const [submitting, setSubmitting] = useState(false);

  const MODES: { value: PlaylistMode; label: string; desc: string }[] = [
    { value: 'fresh', label: 'Fresh', desc: 'Start a new playlist each season' },
    { value: 'cloned', label: 'Cloned', desc: 'Clone tracks from an existing Spotify playlist' },
    { value: 'linked', label: 'Linked', desc: 'Sync with an existing Spotify playlist live' },
  ];

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      const { data: leagueId, error } = await supabase.rpc('create_league', { league_name: form.name.trim() });
      if (error) throw new Error(error.message);
      if (!leagueId) throw new Error('No league ID returned');

      if (form.playlistMode !== 'fresh') {
        await supabase.from('leagues').update({
          master_playlist_mode: form.playlistMode,
          master_playlist_ref: form.playlistRef || null,
        }).eq('id', leagueId as string);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace({ pathname: '/(tabs)/(stack)/league/[id]' as any, params: { id: leagueId as string } });
    } catch (err) {
      Alert.alert('Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <KeyboardScroll contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>New League</Text>
        <Text style={styles.subheading}>Permanent settings — these apply across all seasons.</Text>

        <View style={styles.fields}>
          <Field label="League Name">
            <TextInput
              style={styles.input}
              placeholder="e.g. The Crate Diggers"
              placeholderTextColor="#555"
              value={form.name}
              onChangeText={(name) => setForm({ ...form, name })}
              autoFocus
            />
          </Field>

          <Field label="Master Playlist" hint="How is the all-time league playlist managed?">
            <View style={styles.modeList}>
              {MODES.map(({ value, label, desc }) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.modeCard, form.playlistMode === value && styles.modeCardActive]}
                  onPress={() => setForm({ ...form, playlistMode: value })}
                >
                  <Text style={[styles.modeLabel, form.playlistMode === value && styles.modeLabelActive]}>{label}</Text>
                  <Text style={styles.modeDesc}>{desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>

          {form.playlistMode !== 'fresh' && (
            <Field label="Spotify Playlist URL">
              <TextInput
                style={styles.input}
                placeholder="https://open.spotify.com/playlist/..."
                placeholderTextColor="#555"
                value={form.playlistRef}
                onChangeText={(playlistRef) => setForm({ ...form, playlistRef })}
                autoCapitalize="none"
                keyboardType="url"
              />
            </Field>
          )}
        </View>
      </KeyboardScroll>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.createBtn, (!form.name.trim() || submitting) && styles.btnDisabled]}
          onPress={handleCreate}
          disabled={!form.name.trim() || submitting}
        >
          {submitting
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.createBtnText}>Create League</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  scroll: { padding: 24, paddingBottom: 48, gap: 24 },

  heading: { fontSize: 28, fontWeight: '800', color: '#fff' },
  subheading: { fontSize: 13, color: '#555', marginTop: -16 },

  fields: { gap: 24 },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#666', letterSpacing: 0.8, textTransform: 'uppercase' },
  fieldHint: { fontSize: 11, color: '#444', marginTop: -2 },

  input: {
    backgroundColor: '#111', borderRadius: 10, padding: 14,
    fontSize: 15, color: '#fff', borderWidth: 1, borderColor: '#2a2a2a',
  },

  modeList: { gap: 8 },
  modeCard: { backgroundColor: '#111', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#2a2a2a', gap: 2 },
  modeCardActive: { borderColor: '#1DB954', backgroundColor: '#0a1f10' },
  modeLabel: { fontSize: 14, fontWeight: '700', color: '#666' },
  modeLabelActive: { color: '#1DB954' },
  modeDesc: { fontSize: 12, color: '#444' },

  footer: { padding: 24, paddingBottom: 36, borderTopWidth: 1, borderTopColor: '#111' },
  createBtn: { backgroundColor: '#1DB954', padding: 16, borderRadius: 12, alignItems: 'center' },
  btnDisabled: { opacity: 0.35 },
  createBtnText: { fontSize: 16, fontWeight: '800', color: '#000' },
});
