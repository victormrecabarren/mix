import { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import { usePlayback, type PlaylistTrack } from '@/playback/PlaybackContext';

const PLAYLIST: PlaylistTrack[] = [
  {
    id: 'spotify-blinding-lights',
    source: 'spotify',
    uri: 'spotify:track:0VjIjW4GlUZAMYd2vXMi3b',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    artworkUrl: '',
    durationMs: 200040,
  },
  {
    id: 'sc-close-to-me',
    source: 'soundcloud',
    uri: 'https://soundcloud.com/33below/close-to-me',
    title: 'Close to Me',
    artist: '33 Below',
    artworkUrl: '',
    durationMs: 0,
  },
];

function formatMs(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

export function LeagueTabScreen() {
  const { setPlaylist, playTrack, currentIndex, isPlaying } = usePlayback();

  useEffect(() => {
    setPlaylist(PLAYLIST);
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.root} style={{ backgroundColor: '#000' }}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>Play</Text>
        {/* In future: switches between Submit and Vote badge based on round state */}
        <View style={styles.modeBadge}>
          <Text style={styles.modeBadgeText}>VOTE</Text>
        </View>
      </View>
      <Text style={styles.subheading}>Tap a track to play · vote on your favourites</Text>

      {PLAYLIST.map((track, index) => {
        const isActive = currentIndex === index;
        return (
          <TouchableOpacity
            key={track.id}
            style={[styles.row, isActive && styles.rowActive]}
            onPress={() => playTrack(index)}
            activeOpacity={0.7}
          >
            {/* Position number */}
            <View style={styles.indexWrap}>
              {isActive && isPlaying ? (
                <Text style={styles.playingDot}>▶</Text>
              ) : (
                <Text style={[styles.indexText, isActive && styles.indexTextActive]}>
                  {index + 1}
                </Text>
              )}
            </View>

            {/* Track info */}
            <View style={styles.info}>
              <Text style={[styles.title, isActive && styles.titleActive]} numberOfLines={1}>
                {track.title}
              </Text>
              <Text style={styles.artist} numberOfLines={1}>
                {track.artist}
              </Text>
            </View>

            {/* Source badge + duration */}
            <View style={styles.meta}>
              <View style={[
                styles.badge,
                track.source === 'spotify' ? styles.badgeSpotify : styles.badgeSc,
              ]}>
                <Text style={styles.badgeText}>
                  {track.source === 'spotify' ? 'SP' : 'SC'}
                </Text>
              </View>
              {track.durationMs > 0 && (
                <Text style={styles.duration}>{formatMs(track.durationMs)}</Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#000',
    padding: 24,
    paddingTop: 56,
    paddingBottom: 48,
    gap: 4,
  },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  heading: { fontSize: 24, fontWeight: '800', color: '#fff' },
  modeBadge: { backgroundColor: '#1DB954', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  modeBadgeText: { fontSize: 10, fontWeight: '800', color: '#000', letterSpacing: 1 },
  subheading: { fontSize: 13, color: '#555', marginBottom: 20 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 12,
  },
  rowActive: { backgroundColor: '#111' },

  indexWrap: { width: 24, alignItems: 'center' },
  indexText: { fontSize: 15, color: '#555', fontWeight: '600' },
  indexTextActive: { color: '#fff' },
  playingDot: { fontSize: 12, color: '#1DB954' },

  info: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600', color: '#888' },
  titleActive: { color: '#fff' },
  artist: { fontSize: 13, color: '#555' },

  meta: { alignItems: 'flex-end', gap: 4 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeSpotify: { backgroundColor: '#1DB954' },
  badgeSc: { backgroundColor: '#f50' },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#000' },
  duration: { fontSize: 12, color: '#555' },
});
