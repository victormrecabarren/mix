import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayback } from '@/playback/PlaybackContext';
import { useSession } from '@/context/SessionContext';
import { useLeague } from '@/context/LeagueContext';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme/colors';

function formatMs(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

function SeekBar({
  positionMs,
  durationMs,
  onSeek,
}: {
  positionMs: number;
  durationMs: number;
  onSeek: (ms: number) => void;
}) {
  const [barWidth, setBarWidth] = useState(1);
  const progress = durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0;
  const fillWidth = progress * barWidth;
  const thumbLeft = fillWidth - 6;

  const handleTouch = useCallback(
    (x: number) => {
      const ratio = Math.max(0, Math.min(x / barWidth, 1));
      onSeek(Math.round(ratio * durationMs));
    },
    [barWidth, durationMs, onSeek],
  );

  return (
    <View style={seekStyles.wrap}>
      <View
        style={seekStyles.hitArea}
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => handleTouch(e.nativeEvent.locationX)}
        onResponderMove={(e) => handleTouch(e.nativeEvent.locationX)}
      >
        {/* track */}
        <View style={seekStyles.track}>
          <View style={[seekStyles.fill, { width: fillWidth }]} />
        </View>
        {/* thumb */}
        <View style={[seekStyles.thumb, { left: Math.max(0, thumbLeft) }]} />
      </View>

      <View style={seekStyles.labels}>
        <Text style={seekStyles.time}>{formatMs(positionMs)}</Text>
        <Text style={seekStyles.time}>{durationMs > 0 ? formatMs(durationMs) : '--:--'}</Text>
      </View>
    </View>
  );
}

const seekStyles = StyleSheet.create({
  wrap: { width: '100%', gap: 6 },
  hitArea: {
    height: 28,
    justifyContent: 'center',
    width: '100%',
  },
  track: {
    height: 4,
    backgroundColor: colors.surface5,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    backgroundColor: colors.textPrimary,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.textPrimary,
    top: 8,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: { fontSize: 11, color: colors.textLabel },
});

function ControlBtn({
  label,
  onPress,
  disabled,
  large,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  large?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[ctrlStyles.btn, large && ctrlStyles.btnLarge, disabled && ctrlStyles.btnDisabled]}
    >
      <Text style={[ctrlStyles.label, large && ctrlStyles.labelLarge]}>{label}</Text>
    </TouchableOpacity>
  );
}

const ctrlStyles = StyleSheet.create({
  btn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLarge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.textPrimary,
  },
  btnDisabled: { opacity: 0.3 },
  label: { fontSize: 20, color: colors.textPrimary },
  labelLarge: { fontSize: 26, color: colors.bgPrimary },
});

export function ProfileTabScreen() {
  const {
    currentIndex,
    playlist,
    isPlaying,
    positionMs,
    durationMs,
    title,
    artist,
    pause,
    resume,
    seek,
    next,
    previous,
  } = usePlayback();
  const { session, signOut } = useSession();
  const { activeLeague, setActiveLeagueId, activeLeagueId } = useLeague();
  const [leagues, setLeagues] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    supabase
      .from('league_members')
      .select('league:leagues(id, name)')
      .then(({ data }) => {
        const flat = (data ?? [])
          .map((r) => r.league as { id: string; name: string } | null)
          .filter((l): l is { id: string; name: string } => l !== null);
        setLeagues(flat);
      });
  }, []);

  const handleSwitchLeague = () => {
    if (leagues.length === 0) { Alert.alert('No leagues found'); return; }
    Alert.alert(
      'Switch League',
      `Active: ${activeLeague?.name ?? activeLeagueId ?? 'none'}`,
      [
        ...leagues.map((l) => ({
          text: l.id === activeLeagueId ? `✓ ${l.name}` : l.name,
          onPress: () => setActiveLeagueId(l.id),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  const hasTrack = currentIndex !== null;
  const hasPrevious = currentIndex !== null && currentIndex > 0;
  const hasNext = currentIndex !== null && currentIndex < playlist.length - 1;

  const insets = useSafeAreaInsets();

  const initials = session?.displayName
    ?.split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? '?';

  return (
    <ScrollView
      style={{ backgroundColor: colors.bgPrimary }}
      contentContainerStyle={[styles.root, { paddingTop: insets.top + 16 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── User profile ── */}
      <View style={styles.profileSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.displayName}>{session?.displayName ?? 'You'}</Text>
        {session?.email && <Text style={styles.email}>{session.email}</Text>}
        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutLabel}>Sign Out</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.devBtn} onPress={handleSwitchLeague}>
          <Text style={styles.devBtnLabel}>[DEV] Switch League</Text>
        </TouchableOpacity>
      </View>

      {/* ── Now Playing ── */}
      <View style={styles.playerSection}>
        <Text style={styles.sectionTitle}>NOW PLAYING</Text>

        <View style={styles.artPlaceholder}>
          <Text style={styles.artPlaceholderText}>{hasTrack ? '♪' : '—'}</Text>
        </View>

        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={1}>
            {title || (hasTrack ? 'Loading…' : 'Nothing playing')}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {artist || ''}
          </Text>
        </View>

        <SeekBar positionMs={positionMs} durationMs={durationMs} onSeek={seek} />

        <View style={styles.controls}>
          <ControlBtn label="⏮" onPress={previous} disabled={!hasPrevious} />
          <ControlBtn
            label={isPlaying ? '⏸' : '▶'}
            onPress={isPlaying ? pause : resume}
            disabled={!hasTrack}
            large
          />
          <ControlBtn label="⏭" onPress={next} disabled={!hasNext} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.bgPrimary,
    padding: 32,
    paddingBottom: 48,
    gap: 40,
  },

  // User profile section
  profileSection: { alignItems: 'center', gap: 10 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: { fontSize: 26, fontWeight: '700', color: colors.textPrimary },
  displayName: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  email: { fontSize: 13, color: colors.textMuted },
  signOutBtn: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  signOutLabel: { fontSize: 14, color: colors.textLabel },
  devBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  devBtnLabel: { fontSize: 12, color: colors.textDim },

  // Now Playing section
  playerSection: { alignItems: 'center', gap: 16 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textDim,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    alignSelf: 'flex-start',
  },
  artPlaceholder: {
    width: 200,
    height: 200,
    borderRadius: 12,
    backgroundColor: colors.surface1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artPlaceholderText: { fontSize: 56, color: colors.textFaint },
  trackInfo: { alignItems: 'center', gap: 4, width: '100%' },
  trackTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  trackArtist: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 24, marginTop: 4 },
});
