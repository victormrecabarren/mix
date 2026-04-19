import { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useLeague } from '@/context/LeagueContext';
import { useSession } from '@/context/SessionContext';
import { useJoinInviteInfo } from '@/queries/useJoinInviteInfo';
import { useIsLeagueMember } from '@/queries/useIsLeagueMember';
import { useJoinLeague } from '@/queries/useJoinLeague';
import { MixError, NotAuthenticatedError } from '@/services/errors';
import { SwipeSheet } from '@/components/SwipeSheet';

export function JoinScreen({ token }: { token: string }) {
  const router = useRouter();
  const { setActiveLeagueId } = useLeague();
  const { supabaseUserId } = useSession();

  const inviteQuery = useJoinInviteInfo(token);
  const info = inviteQuery.data;
  const memberQuery = useIsLeagueMember(
    info?.leagueId,
    supabaseUserId ?? undefined,
  );
  const alreadyMember = memberQuery.data === true;
  const joinMutation = useJoinLeague();
  const loading = inviteQuery.isPending || (!!info && memberQuery.isPending);
  const joining = joinMutation.isPending;

  const handleClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/(home)');
  }, [router]);

  const handleJoin = async (role: 'participant' | 'spectator') => {
    if (!info) return;
    if (!supabaseUserId) {
      Alert.alert('Failed to join', new NotAuthenticatedError().message);
      return;
    }
    try {
      await joinMutation.mutateAsync({
        leagueId: info.leagueId,
        userId: supabaseUserId,
        role,
      });
      setActiveLeagueId(info.leagueId);
      router.replace('/(tabs)/(home)');
    } catch (err) {
      Alert.alert('Failed to join', err instanceof MixError ? err.message : 'Unknown error');
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
  } else if (alreadyMember) {
    content = (
      <View style={styles.stateBlock}>
        <Text style={styles.errorTitle}>Already a member</Text>
        <Text style={styles.errorBody}>You're already in {info.leagueName}.</Text>
        <TouchableOpacity
          style={styles.btn}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => { setActiveLeagueId(info.leagueId); router.replace('/(tabs)/(home)'); }}
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
