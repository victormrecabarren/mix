import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { usePlayback } from '@/playback/PlaybackContext';
import { useSession } from '@/context/SessionContext';

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
    backgroundColor: '#333',
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    top: 8,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: { fontSize: 11, color: '#666' },
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
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLarge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#fff',
  },
  btnDisabled: { opacity: 0.3 },
  label: { fontSize: 20, color: '#fff' },
  labelLarge: { fontSize: 26, color: '#000' },
});

export function ProfileTabScreen() {
  const {
    currentIndex,
    playlist,
    isPlaying,
    positionMs,
    durationMs,
    artworkUrl,
    title,
    artist,
    pause,
    resume,
    seek,
    next,
    previous,
  } = usePlayback();
  const { signOut } = useSession();

  const hasTrack = currentIndex !== null;
  const hasPrevious = currentIndex !== null && currentIndex > 0;
  const hasNext = currentIndex !== null && currentIndex < playlist.length - 1;

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Now Playing</Text>

      {/* Artwork */}
      {artworkUrl ? (
        <Image source={{ uri: artworkUrl }} style={styles.art} />
      ) : (
        <View style={[styles.art, styles.artPlaceholder]}>
          <Text style={styles.artPlaceholderText}>{hasTrack ? '♪' : '—'}</Text>
        </View>
      )}

      {/* Track info */}
      <View style={styles.trackInfo}>
        <Text style={styles.title} numberOfLines={1}>
          {title || (hasTrack ? 'Loading…' : 'Nothing playing')}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {artist || ''}
        </Text>
      </View>

      {/* Seek bar */}
      <SeekBar positionMs={positionMs} durationMs={durationMs} onSeek={seek} />

      {/* Controls */}
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

      {/* Voting placeholder — shown when track is part of an active voting round */}
      {hasTrack && (
        <View style={styles.votingPlaceholder}>
          <Text style={styles.votingLabel}>VOTING</Text>
          <Text style={styles.votingBody}>
            Point allocation controls will appear here when this track is part of an active voting round.
          </Text>
        </View>
      )}

      <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
        <Text style={styles.signOutLabel}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
    padding: 32,
    paddingTop: 60,
    alignItems: 'center',
    gap: 20,
  },
  heading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    alignSelf: 'center',
  },
  art: {
    width: 240,
    height: 240,
    borderRadius: 12,
    marginVertical: 8,
  },
  artPlaceholder: {
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artPlaceholderText: { fontSize: 64, color: '#333' },
  trackInfo: { alignItems: 'center', gap: 4, width: '100%' },
  title: { fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center' },
  artist: { fontSize: 15, color: '#888', textAlign: 'center' },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginTop: 8,
  },
  votingPlaceholder: {
    marginTop: 16,
    width: '100%',
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: '#222',
  },
  votingLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1DB954',
    letterSpacing: 1.5,
  },
  votingBody: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
  },
  signOutBtn: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  signOutLabel: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
