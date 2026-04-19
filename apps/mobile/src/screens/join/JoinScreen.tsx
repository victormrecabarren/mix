import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { SwipeSheet } from '@/components/SwipeSheet';

type JoinInfo = {
  seasonId: string;
  seasonName: string;
  seasonStatus: string;
  leagueId: string;
  leagueName: string;
  alreadyMember: boolean;
};

type JoinInviteLookup = {
  season_id: string;
  season_name: string;
  season_status: string;
  league_id: string;
  league_name: string;
};

export function JoinScreen({ token }: { token: string }) {
  const router = useRouter();
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  const handleClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)');
  }, [router]);

  const fetchInfo = useCallback(async () => {
    const { data, error } = await supabase
      .rpc('get_join_invite_info' as never, { invite_token: token } as never)
      .single();
    const inviteInfo = data as JoinInviteLookup | null;

    if (error || !inviteInfo) {
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    let alreadyMember = false;
    if (user) {
      const { data: membership } = await supabase
        .from('league_members')
        .select('user_id')
        .eq('league_id', inviteInfo.league_id)
        .eq('user_id', user.id)
        .maybeSingle();
      alreadyMember = membership !== null;
    }

    setInfo({
      seasonId: inviteInfo.season_id,
      seasonName: inviteInfo.season_name,
      seasonStatus: inviteInfo.season_status,
      leagueId: inviteInfo.league_id,
      leagueName: inviteInfo.league_name,
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
      router.replace({ pathname: '/(tabs)/(stack)/league/[id]' as any, params: { id: info.leagueId } });
    } catch (err) {
      Alert.alert('Failed to join', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setJoining(false);
    }
  };

  let content: React.ReactNode;

  if (loading) {
    content = (
      <View style={styles.stateBlock}>
        <ActivityIndicator color="#555" />
      </View>
    );
  } else if (!info) {
    content = (
      <View style={styles.stateBlock}>
        <Text style={styles.errorTitle}>Invalid invite link</Text>
        <Text style={styles.errorBody}>This link may have expired or is incorrect.</Text>
      </View>
    );
  } else if (info.seasonStatus === 'completed') {
    content = (
      <View style={styles.stateBlock}>
        <Text style={styles.errorTitle}>Season has ended</Text>
        <Text style={styles.errorBody}>
          {info.seasonName} in {info.leagueName} is no longer accepting new members.
        </Text>
      </View>
    );
  } else if (info.alreadyMember) {
    content = (
      <View style={styles.stateBlock}>
        <Text style={styles.errorTitle}>Already a member</Text>
        <Text style={styles.errorBody}>You're already in {info.leagueName}.</Text>
        <TouchableOpacity
          style={styles.btn}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => router.replace({ pathname: '/(tabs)/(stack)/league/[id]' as any, params: { id: info.leagueId } })}
        >
          <Text style={styles.btnText}>Go to League</Text>
        </TouchableOpacity>
      </View>
    );
  } else {
    content = (
      <>
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
      </>
    );
  }

  return (
    <SwipeSheet
      visible
      onRequestClose={handleClose}
      dismissThreshold={80}
      dismissVelocityThreshold={0.5}
      closeDuration={300}
      backgroundColor="#050505"
      backdropColor="rgba(0,0,0,0.45)"
      sheetStyle={styles.sheet}
      renderHeaderRight={({ dismiss }) => (
        <TouchableOpacity style={styles.closeBtnInline} onPress={dismiss}>
          <Text style={styles.closeBtnText}>Close</Text>
        </TouchableOpacity>
      )}
    >
      {() => (
        <>
          <View style={styles.content}>
            {content}
          </View>
        </>
      )}
    </SwipeSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#050505',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: '#222',
    overflow: 'hidden',
  },
  content: {
    paddingHorizontal: 32,
    paddingBottom: 36,
    gap: 32,
  },
  stateBlock: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  closeBtnInline: {
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  closeBtnText: { fontSize: 15, color: '#888', fontWeight: '600' },
  errorTitle: { fontSize: 20, fontWeight: '800', color: '#fff', textAlign: 'center' },
  errorBody: { fontSize: 14, color: '#555', textAlign: 'center' },
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
