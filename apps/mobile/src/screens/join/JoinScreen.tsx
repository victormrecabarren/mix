import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

type JoinInfo = {
  seasonId: string;
  seasonName: string;
  leagueId: string;
  leagueName: string;
  alreadyMember: boolean;
};

export function JoinScreen({ token }: { token: string }) {
  const router = useRouter();
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  const fetchInfo = useCallback(async () => {
    const { data: season, error } = await supabase
      .from('seasons')
      .select('id, name, league_id')
      .eq('invite_token', token)
      .single();

    if (error || !season) {
      setLoading(false);
      return;
    }

    const { data: league } = await supabase
      .from('leagues')
      .select('id, name')
      .eq('id', season.league_id)
      .single();

    const { data: { user } } = await supabase.auth.getUser();
    let alreadyMember = false;
    if (user) {
      const { data: membership } = await supabase
        .from('league_members')
        .select('user_id')
        .eq('league_id', season.league_id)
        .eq('user_id', user.id)
        .maybeSingle();
      alreadyMember = membership !== null;
    }

    setInfo({
      seasonId: season.id,
      seasonName: season.name,
      leagueId: season.league_id,
      leagueName: league?.name ?? 'Unknown League',
      alreadyMember,
    });
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  const handleJoin = async (role: 'participant' | 'spectator') => {
    if (!info) return;
    setJoining(true);
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('league_members')
        .insert({ league_id: info.leagueId, user_id: user.id, role });

      if (error) throw new Error(error.message);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace({ pathname: '/league/[id]' as any, params: { id: info.leagueId } });
    } catch (err) {
      Alert.alert('Failed to join', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#555" />
      </View>
    );
  }

  if (!info) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Invalid invite link</Text>
        <Text style={styles.errorBody}>This link may have expired or is incorrect.</Text>
      </View>
    );
  }

  if (info.alreadyMember) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Already a member</Text>
        <Text style={styles.errorBody}>You're already in {info.leagueName}.</Text>
        <TouchableOpacity
          style={styles.btn}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => router.replace({ pathname: '/league/[id]' as any, params: { id: info.leagueId } })}
        >
          <Text style={styles.btnText}>Go to League</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.label}>YOU'RE INVITED TO</Text>
        <Text style={styles.leagueName}>{info.leagueName}</Text>
        <Text style={styles.seasonName}>{info.seasonName}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, joining && styles.btnDisabled]}
          onPress={() => handleJoin('participant')}
          disabled={joining}
        >
          {joining
            ? <ActivityIndicator color="#000" />
            : <Text style={[styles.btnText, styles.btnTextPrimary]}>Join as Participant</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary, joining && styles.btnDisabled]}
          onPress={() => handleJoin('spectator')}
          disabled={joining}
        >
          <Text style={[styles.btnText, styles.btnTextSecondary]}>Join as Spectator</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>
        Participants submit tracks and vote. Spectators can watch and listen but not compete.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  errorTitle: { fontSize: 20, fontWeight: '800', color: '#fff', textAlign: 'center' },
  errorBody: { fontSize: 14, color: '#555', textAlign: 'center' },

  root: {
    flex: 1,
    backgroundColor: '#000',
    padding: 32,
    paddingTop: 80,
    alignItems: 'center',
    gap: 32,
  },
  card: {
    width: '100%',
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#222',
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1DB954',
    letterSpacing: 2,
  },
  leagueName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  seasonName: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },

  actions: { width: '100%', gap: 12 },
  btn: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnPrimary: { backgroundColor: '#1DB954' },
  btnSecondary: { backgroundColor: '#111', borderWidth: 1, borderColor: '#333' },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontSize: 16, fontWeight: '700' },
  btnTextPrimary: { color: '#000' },
  btnTextSecondary: { color: '#888' },

  hint: {
    fontSize: 12,
    color: '#444',
    textAlign: 'center',
    lineHeight: 18,
  },
});
