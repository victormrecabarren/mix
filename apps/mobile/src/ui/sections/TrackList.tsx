// Apple-Music-style tracklist used by playlist / round-results detail views.
// Lifted verbatim from `app/ui-preview/playlist/[id].tsx` row design.
// Pure presentational — no data fetching, no router calls.
//
// Each row is artwork + title/artist + a trailing "···". Optional rank,
// points, submitter name, and submitter comment render on supported rows.

import { Image } from "expo-image";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { THEME } from "@/ui/theme";

export type TrackListItem = {
  id: string;
  title: string;
  artist?: string;
  artworkUrl?: string;
  submitterName?: string;
  points?: number;
  rank?: number;
  comment?: string;
};

export type TrackListProps = {
  tracks: TrackListItem[];
  onTrackPress?: (id: string) => void;
};

// Stable cycling hue for placeholder artwork — matches the preview design.
function placeholderHue(index: number): string {
  return `hsl(${(index * 47) % 360}, 55%, 62%)`;
}

export function TrackList({ tracks, onTrackPress }: TrackListProps) {
  return (
    <View style={styles.trackList}>
      {tracks.map((track, i) => {
        const isLast = i === tracks.length - 1;
        const RowComponent = onTrackPress ? Pressable : View;
        return (
          <RowComponent
            key={track.id}
            style={[styles.trackRow, !isLast && styles.trackRowBorder]}
            onPress={onTrackPress ? () => onTrackPress(track.id) : undefined}
          >
            <View style={styles.rowMain}>
              {typeof track.rank === "number" ? (
                <Text style={styles.rank}>{track.rank}</Text>
              ) : null}
              {track.artworkUrl ? (
                <Image
                  source={{ uri: track.artworkUrl }}
                  style={styles.trackArt}
                  contentFit="cover"
                  transition={0}
                />
              ) : (
                <View
                  style={[
                    styles.trackArt,
                    { backgroundColor: placeholderHue(i) },
                  ]}
                />
              )}
              <View style={styles.rowMeta}>
                <Text style={styles.trackTitle} numberOfLines={1}>
                  {track.title}
                </Text>
                {track.artist ? (
                  <Text style={styles.trackArtist} numberOfLines={1}>
                    {track.artist}
                  </Text>
                ) : null}
                {track.submitterName ? (
                  <Text style={styles.submitter} numberOfLines={1}>
                    submitted by {track.submitterName}
                  </Text>
                ) : null}
              </View>
              {typeof track.points === "number" ? (
                <View style={styles.scoreCol}>
                  <Text style={styles.scoreValue}>{track.points}</Text>
                  <Text style={styles.scoreLabel}>pts</Text>
                </View>
              ) : (
                <Text style={styles.trackMore}>···</Text>
              )}
            </View>
            {track.comment ? (
              <Text style={styles.comment} numberOfLines={3}>
                &ldquo;{track.comment}&rdquo;
              </Text>
            ) : null}
          </RowComponent>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  trackList: {
    backgroundColor: THEME.bg,
    paddingHorizontal: 20,
  },
  trackRow: {
    paddingVertical: 10,
  },
  trackRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: THEME.rule,
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rank: {
    width: 20,
    textAlign: "center",
    ...THEME.text.trackMore,
    color: THEME.muted,
  },
  trackArt: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: THEME.rule,
  },
  rowMeta: { flex: 1, minWidth: 0 },
  trackTitle: {
    ...THEME.text.trackTitle,
  },
  trackArtist: {
    ...THEME.text.trackArtist,
    marginTop: 1,
  },
  submitter: {
    ...THEME.text.playlistTileMeta,
    marginTop: 2,
  },
  trackMore: {
    ...THEME.text.trackMore,
    width: 20,
    textAlign: "right",
  },
  scoreCol: {
    alignItems: "flex-end",
    minWidth: 40,
  },
  scoreValue: {
    ...THEME.text.trackTitle,
    color: THEME.ink,
  },
  scoreLabel: {
    ...THEME.text.trackArtist,
  },
  comment: {
    marginTop: 6,
    marginLeft: 56,
    color: THEME.muted,
    fontFamily: THEME.fonts.serifItalic,
    fontSize: 12,
    lineHeight: 17,
  },
});
