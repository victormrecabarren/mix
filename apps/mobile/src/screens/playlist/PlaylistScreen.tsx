// Round playlist — the read-only "review the results as a playlist" surface
// that opens from the results screen's "Go to Playlist" button. Same hero +
// header shape as the voting screen, but the rows are read-only: no vote
// arrows, no comment input. Each row shows the points the track earned,
// the winner gets a chrome ★, and tapping the comment icon expands an
// accordion with all voter comments for that track.

import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  LayoutAnimation,
  Pressable,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle,
  MessageCircleMore,
} from "lucide-react-native";

import { useRound } from "@/queries/useRound";
import { useRoundSubmissions } from "@/queries/useRoundSubmissions";
import { useRoundResults } from "@/queries/useRoundResults";
import { useRoundVoters } from "@/queries/useRoundVoters";
import { useLeague } from "@/queries/useLeague";
import { usePlayback, type PlaylistTrack } from "@/playback/PlaybackContext";
import { normalizeSpotifyTrackUri } from "@/lib/spotifyTrackUri";
import { useTabBarBottomInset } from "@/ui/hooks/useTabBarBottomInset";
import { THEME } from "@/ui/theme";
import { Wallpaper } from "@/ui/Wallpaper";
import { ChromeText } from "@/ui/ChromeText";
import { ChromeBorder } from "@/ui/ChromeBorder";
import { ChromeButton } from "@/ui/ChromeButton";
import { RoundHero, ROUND_HERO_IMAGE_KEY } from "@/ui/cards/RoundHero";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Submission = {
  id: string;
  user_id: string;
  track_title: string;
  track_artist: string;
  track_artwork_url: string | null;
  spotify_track_id: string | null;
  track_isrc: string;
  comment: string | null;
  created_at?: string;
};

const AVATAR_PASTELS = [
  "#F5C8E2",
  "#E2C8F5",
  "#FFE3B8",
  "#C8E5C8",
  "#FFC8C8",
  "#C8DAEF",
  "#FFD7E8",
];
function pastelFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PASTELS[h % AVATAR_PASTELS.length];
}

function submissionToPlaylistTrack(s: Submission): PlaylistTrack | null {
  if (!s.spotify_track_id) return null;
  return {
    id: s.id,
    source: "spotify",
    uri: normalizeSpotifyTrackUri(s.spotify_track_id),
    title: s.track_title,
    artist: s.track_artist,
    artworkUrl: s.track_artwork_url ?? "",
    durationMs: 0,
  };
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function PlaylistScreen({ roundId }: { roundId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const bottomInset = useTabBarBottomInset();
  const { height: screenHeight } = useWindowDimensions();
  const heroHeight = screenHeight * 0.55;

  const { data: round } = useRound(roundId);
  const { data: submissionsData = [] } = useRoundSubmissions(roundId);
  const { data: resultsData = [] } = useRoundResults(roundId);
  const { data: votersData = {} } = useRoundVoters(roundId);
  const leagueId = round?.seasons?.league_id;
  const { data: league } = useLeague(leagueId);

  const submissions = submissionsData as Submission[];

  const playback = usePlayback();

  // Points map: submission id → points (effective, post-forfeit-void).
  const pointsBySub = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of resultsData) m[r.submission_id] = r.points_effective;
    return m;
  }, [resultsData]);

  // Winning submission id — top by points_effective, ignoring forfeits.
  const winningSubId = useMemo(() => {
    const eligible = resultsData
      .filter((r) => !r.is_void)
      .sort(
        (a, b) =>
          b.points_effective - a.points_effective ||
          b.points_raw - a.points_raw,
      );
    return eligible[0]?.submission_id ?? null;
  }, [resultsData]);

  const orderedPlaylist: PlaylistTrack[] = useMemo(
    () =>
      submissions
        .map(submissionToPlaylistTrack)
        .filter((t): t is PlaylistTrack => t !== null),
    [submissions],
  );

  const onPlay = () => {
    if (orderedPlaylist.length === 0) return;
    playback.setPlaylist(orderedPlaylist);
    setTimeout(() => playback.playTrack(0), 0);
  };

  const onAddToSpotify = () => {
    Alert.alert(
      "Add to Spotify",
      "Coming soon — this will save the round playlist to your Spotify account.",
    );
  };

  // Pull-to-refresh — same mechanism as the home tab.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["round", roundId] }),
    ]);
    setRefreshing(false);
  }, [queryClient, roundId]);

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["round", roundId] });
    }, [queryClient, roundId]),
  );

  if (!round) {
    return (
      <Wallpaper halftone={false}>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <ActivityIndicator color={THEME.ink} style={{ marginTop: 80 }} />
        </SafeAreaView>
      </Wallpaper>
    );
  }

  const pickNum = String(round.round_number).padStart(2, "0");
  const pillLabel = [
    `R${pickNum}`,
    round.seasons?.name ? round.seasons.name.toUpperCase() : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const metaTail = `${submissions.length} TRACKS · FINAL`;

  return (
    <Wallpaper halftone={false}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={THEME.ink}
            />
          }
        >
          {/* Hero — same image+video+fade as the voting screen so the iOS
              zoom transition lands seamlessly when navigating from results. */}
          <View>
            <RoundHero imageKey={ROUND_HERO_IMAGE_KEY} heroHeight={heroHeight} />

            <View style={styles.titleOverlay} pointerEvents="none">
              <View style={styles.titleRow}>
                <Text style={styles.titleText} numberOfLines={3}>
                  {round.prompt}
                </Text>
                <ChromeText
                  glyph="★"
                  size={22}
                  style={styles.titleStar}
                />
              </View>
              <View style={styles.metaRow}>
                {pillLabel ? (
                  <View style={styles.metaPill}>
                    <Text style={styles.metaPillText} numberOfLines={1}>
                      {pillLabel}
                    </Text>
                  </View>
                ) : null}
                <Text style={styles.metaTail} numberOfLines={1}>
                  {pillLabel ? " · " : ""}
                  {metaTail}
                </Text>
              </View>
            </View>
          </View>

          {/* Buttons */}
          <View style={styles.buttonsRow}>
            <ChromeButton onPress={onPlay} style={{ flex: 1 }}>
              <View style={styles.playTriangle} />
              <Text style={styles.btnLabelDark}>Play</Text>
            </ChromeButton>
            <Pressable
              style={[styles.btnInner, styles.btnDarkBg]}
              onPress={onAddToSpotify}
            >
              <Text style={styles.btnGlyphLight}>+</Text>
              <Text style={styles.btnLabelLight}>Add to Spotify</Text>
            </Pressable>
          </View>

          {/* Playlist rows */}
          <View style={styles.playlistBody}>
            {submissions.map((sub, idx) => (
              <PlaylistTrackRow
                key={sub.id}
                index={idx}
                submission={sub}
                points={pointsBySub[sub.id] ?? 0}
                isWinner={winningSubId === sub.id}
                voters={votersData[sub.id] ?? []}
                isLast={idx === submissions.length - 1}
              />
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Wallpaper>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

type VoterRow = {
  voter_user_id: string;
  voter_name: string;
  points: number;
  comment: string | null;
};

function PlaylistTrackRow({
  index,
  submission,
  points,
  isWinner,
  voters,
  isLast,
}: {
  index: number;
  submission: Submission;
  points: number;
  isWinner: boolean;
  voters: VoterRow[];
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  // Visible voters in the accordion: comment authors only (this screen is
  // about reading reactions, not about who voted how). Voter ordering kept
  // as-is from the RPC.
  const commenters = voters.filter(
    (v) => (v.comment ?? "").trim().length > 0,
  );
  const hasComments = commenters.length > 0;

  const toggle = () => {
    if (!hasComments) return; // no-op if nothing to expand
    LayoutAnimation.configureNext({
      duration: 180,
      create: { type: "easeInEaseOut", property: "opacity" },
      update: { type: "easeInEaseOut" },
      delete: { type: "easeInEaseOut", property: "opacity" },
    });
    setExpanded((v) => !v);
  };

  return (
    <View>
      <View style={styles.row}>
        <Text style={styles.rowNum}>{String(index + 1).padStart(2, "0")}</Text>
        {submission.track_artwork_url ? (
          <ChromeBorder
            radius={8}
            thickness={1}
            clip
            style={styles.rowArt}
          >
            <Image
              source={{ uri: submission.track_artwork_url }}
              style={{ width: "100%", height: "100%" }}
            />
          </ChromeBorder>
        ) : (
          <View style={[styles.rowArt, styles.rowArtPh]} />
        )}
        <View style={styles.rowMeta}>
          <View style={styles.rowTitleLine}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {submission.track_title}
            </Text>
            {isWinner ? (
              <ChromeText
                glyph="★"
                size={14}
                style={{ marginLeft: 4 }}
              />
            ) : null}
          </View>
          <Text style={styles.rowArtist} numberOfLines={1}>
            {submission.track_artist}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.commentIconBtn}
          onPress={toggle}
          hitSlop={6}
          disabled={!hasComments}
        >
          {hasComments ? (
            <MessageCircleMore
              size={18}
              color={THEME.ink}
              fill={THEME.ink}
              strokeWidth={2}
              opacity={expanded ? 1 : 0.7}
            />
          ) : (
            <MessageCircle
              size={18}
              color={THEME.ink}
              strokeWidth={2}
              opacity={0.25}
            />
          )}
        </TouchableOpacity>

        <View style={styles.ptsPill}>
          <Text style={styles.ptsPillText}>+{points}</Text>
        </View>
      </View>

      {expanded && hasComments ? (
        <View style={styles.commentsAccordion}>
          {commenters.map((v, vi) => (
            <View key={v.voter_user_id}>
              {vi > 0 ? <View style={styles.commentDivider} /> : null}
              <View style={styles.commentRow}>
                <ChromeBorder
                  radius={13}
                  thickness={1.5}
                  innerBg={pastelFor(v.voter_user_id)}
                  clip
                  style={styles.commentAvatar}
                >
                  <View style={styles.commentAvatarCenter}>
                    <Text style={styles.commentAvatarInitial}>
                      {(v.voter_name ?? "?").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                </ChromeBorder>
                <View style={styles.commentTextCol}>
                  <Text style={styles.commentVoterName} numberOfLines={1}>
                    {v.voter_name}
                  </Text>
                  <Text style={styles.commentText}>
                    &ldquo;{v.comment}&rdquo;
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {!isLast ? <View style={styles.trackDivider} /> : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Hero title overlay
  titleOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 18,
    paddingHorizontal: 28,
    alignItems: "center",
    gap: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  titleText: {
    fontFamily: THEME.fonts.serifBold,
    fontStyle: "italic",
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.6,
    color: "#fff",
    textAlign: "center",
  },
  titleStar: {
    marginLeft: 6,
    marginTop: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  metaPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#2a0e4a",
  },
  metaPillText: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: "#e8d5ff",
  },
  metaTail: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: THEME.ink,
  },

  // Buttons row
  buttonsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 22,
    marginTop: 8,
    marginBottom: 18,
  },
  btnInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 26,
  },
  btnDarkBg: {
    backgroundColor: "#2a0e4a",
  },
  btnLabelDark: {
    fontFamily: THEME.fonts.sansSemi,
    fontSize: 14,
    color: THEME.ink,
  },
  btnLabelLight: {
    fontFamily: THEME.fonts.sansSemi,
    fontSize: 14,
    color: "#e8d5ff",
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftWidth: 10,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: THEME.ink,
    marginLeft: 2,
  },
  btnGlyphLight: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 18,
    color: "#e8d5ff",
  },

  // Playlist rows
  playlistBody: {
    paddingHorizontal: 18,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 10,
  },
  rowNum: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: THEME.muted,
    width: 22,
    textAlign: "left",
  },
  rowArt: {
    width: 44,
    height: 44,
  },
  rowArtPh: {
    backgroundColor: "rgba(26,8,20,0.08)",
    borderRadius: 8,
  },
  rowMeta: {
    flex: 1,
    gap: 2,
  },
  rowTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  rowTitle: {
    fontFamily: THEME.fonts.serifBold,
    fontStyle: "italic",
    fontSize: 16,
    letterSpacing: -0.3,
    color: THEME.ink,
  },
  rowArtist: {
    fontFamily: THEME.fonts.sansMedium,
    fontSize: 12,
    color: THEME.muted,
  },
  commentIconBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  ptsPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#2a0e4a",
    minWidth: 44,
    alignItems: "center",
  },
  ptsPillText: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 12,
    color: "#e8d5ff",
  },

  // Inline accordion under a row
  commentsAccordion: {
    backgroundColor: "rgba(255,255,255,0.45)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 2,
    marginBottom: 6,
    marginLeft: 32,
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  commentAvatar: {
    width: 26,
    height: 26,
  },
  commentAvatarCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  commentAvatarInitial: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 11,
    color: THEME.ink,
  },
  commentTextCol: {
    flex: 1,
    gap: 1,
  },
  commentVoterName: {
    fontFamily: THEME.fonts.sansSemi,
    fontSize: 12,
    color: THEME.ink,
  },
  commentText: {
    fontFamily: THEME.fonts.serifItalic,
    fontSize: 13,
    lineHeight: 17,
    color: THEME.muted,
  },
  commentDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(26,8,20,0.12)",
    marginVertical: 8,
    marginLeft: 36,
  },

  trackDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(26,8,20,0.12)",
    marginHorizontal: 6,
  },
});
