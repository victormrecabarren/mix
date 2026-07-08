// Round playlist — the read-only "review the results as a playlist" surface
// that opens from the results screen's "Go to Playlist" button. Same hero +
// header shape as the voting screen, but the rows are read-only: no vote
// arrows, no comment input. Each row shows the points the track earned,
// the winner gets a chrome ★, and tapping the comment icon expands an
// accordion with all voter comments for that track.

import { useEffect, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Image,
  LayoutAnimation,
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
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  MessageCircle,
  MessageCircleMore,
  Plus,
} from "lucide-react-native";

import { useRound } from "@/queries/useRound";
import { useRoundSubmissions } from "@/queries/useRoundSubmissions";
import { useRoundResults } from "@/queries/useRoundResults";
import { useRoundVoters } from "@/queries/useRoundVoters";
import { useLeague } from "@/queries/useLeague";
import { usePlayback, type PlaylistTrack } from "@/playback/PlaybackContext";
import { useSession } from "@/context/SessionContext";
import { submissionToPlaylistTrack } from "@/lib/utils/submissionPlayback";
import { auditMusicCredentials } from "@/lib/musicCredentialAudit";
import { useTabBarBottomInset } from "@/ui/hooks/useTabBarBottomInset";
import { THEME } from "@/ui/theme";
import { Wallpaper } from "@/ui/Wallpaper";
import { BouncyPressable } from "@/ui/BouncyPressable";
import { ChromeText } from "@/ui/ChromeText";
import { ChromeBorder } from "@/ui/ChromeBorder";
import { RoundHero, ROUND_HERO_IMAGE_KEY } from "@/ui/cards/RoundHero";
import { PlayingIndicator } from "@/ui/playback/PlayingIndicator";
import { formatVotesDueCopy } from "@/lib/utils/dueCopy";

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
  track_source: "spotify" | "soundcloud" | "applemusic";
  spotify_track_id: string | null;
  soundcloud_track_url: string | null;
  apple_music_id: string | null;
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
  const { session } = useSession();
  const listenerService =
    session?.musicService === "applemusic" ? "applemusic" : "spotify";

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
        .map((s) => submissionToPlaylistTrack(s, listenerService))
        .filter((t): t is PlaylistTrack => t !== null),
    [submissions, listenerService],
  );

  useEffect(() => {
    auditMusicCredentials("playback.playlistMapping.playlistScreen", {
      loggedInMusicService: session?.musicService ?? null,
      listenerService,
      submissionCount: submissions.length,
      playableCount: orderedPlaylist.length,
      rows: submissions.map((s) => ({
        submissionId: s.id,
        submittedSource: s.track_source,
        listenerService,
        playbackSource:
          s.track_source === "soundcloud" ? "soundcloud" : listenerService,
        hasSpotifyTrackId: !!s.spotify_track_id,
        hasAppleMusicId: !!s.apple_music_id,
        hasSoundCloudUrl: !!s.soundcloud_track_url,
        isPlayable: orderedPlaylist.some((t) => t.id === s.id),
      })),
    });
  }, [listenerService, orderedPlaylist, session?.musicService, submissions]);

  const onPlay = () => {
    if (orderedPlaylist.length === 0) return;
    auditMusicCredentials("playback.playlistStart.playlistScreen", {
      loggedInMusicService: session?.musicService ?? null,
      listenerService,
      startIndex: 0,
      trackCount: orderedPlaylist.length,
      playbackSources: orderedPlaylist.map((t) => t.source),
      spotifyCredentialsExpected: listenerService === "spotify",
      appleMusicCredentialsExpected: listenerService === "applemusic",
    });
    playback.playPlaylist(orderedPlaylist, 0);
  };

  const onAddToSpotify = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: "Add",
          options: ["Cancel", "Add to Spotify"],
          cancelButtonIndex: 0,
        },
        () => {},
      );
      return;
    }
    Alert.alert("Add", "Add to Spotify");
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
        <View style={{ flex: 1 }}>
          <ActivityIndicator color={THEME.ink} style={{ marginTop: 80 }} />
        </View>
      </Wallpaper>
    );
  }

  const dueCopy = formatVotesDueCopy(round.voting_deadline_at);

  return (
    <Wallpaper halftone={false}>
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
              <ChromeText glyph="★" size={22} style={styles.titleStar} />
            </View>
            {round.description ? (
              <Text style={styles.heroDescription} numberOfLines={3}>
                {round.description}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controlsRow}>
          <BouncyPressable
            style={[styles.circleControl, styles.circleControlMuted]}
            disabled
          >
            <Clock size={17} color={THEME.ink} strokeWidth={2.6} />
          </BouncyPressable>
          <BouncyPressable style={styles.playControl} onPress={onPlay}>
            <View style={styles.playTriangle} />
            <Text style={styles.playControlText}>Play</Text>
          </BouncyPressable>
          <BouncyPressable style={styles.circleControl} onPress={onAddToSpotify}>
            <Plus size={17} color={THEME.ink} strokeWidth={2.6} />
          </BouncyPressable>
        </View>

        <Text style={styles.dueLine} numberOfLines={2}>
          {dueCopy}
        </Text>

        {/* Playlist rows */}
        <View style={styles.playlistBody}>
          {submissions.map((sub, idx) => {
            // ID-based current-track match — works even when the currently
            // playing track is from a different playlist than this round.
            const playingTrackId =
              playback.currentIndex !== null
                ? playback.playlist[playback.currentIndex]?.id
                : null;
            const isCurrentTrack = playingTrackId === sub.id;
            return (
              <PlaylistTrackRow
                key={sub.id}
                submission={sub}
                points={pointsBySub[sub.id] ?? 0}
                isWinner={winningSubId === sub.id}
                voters={votersData[sub.id] ?? []}
                isLast={idx === submissions.length - 1}
                isCurrentTrack={isCurrentTrack}
                isPlaying={isCurrentTrack && playback.isPlaying}
                onPress={() => {
                  // Map the tapped submission to its index in the *filtered*
                  // playable list. Using `idx` (the submissions index) is wrong
                  // when any row was filtered out, and can land out of range →
                  // startTrack silently no-ops.
                  const targetIndex = orderedPlaylist.findIndex(
                    (t) => t.id === sub.id,
                  );
                  console.log("[mix-debug] tap row", {
                    subId: sub.id,
                    title: sub.track_title,
                    trackSource: sub.track_source,
                    listenerService,
                    musicService: session?.musicService,
                    submissionsCount: submissions.length,
                    playableCount: orderedPlaylist.length,
                    targetIndex,
                    apple_music_id: sub.apple_music_id,
                    spotify_track_id: sub.spotify_track_id,
                    soundcloud_track_url: sub.soundcloud_track_url,
                  });
                  if (targetIndex === -1) {
                    console.log(
                      "[mix-debug] not playable for this listener — filtered out",
                      { subId: sub.id, trackSource: sub.track_source },
                    );
                    return;
                  }
                  auditMusicCredentials("playback.rowStart.playlistScreen", {
                    loggedInMusicService: session?.musicService ?? null,
                    listenerService,
                    submittedSource: sub.track_source,
                    playbackSource: orderedPlaylist[targetIndex]?.source,
                    targetIndex,
                    submissionId: sub.id,
                    spotifyCredentialsExpected:
                      orderedPlaylist[targetIndex]?.source === "spotify",
                    appleMusicCredentialsExpected:
                      orderedPlaylist[targetIndex]?.source === "applemusic",
                  });
                  playback.playPlaylist(orderedPlaylist, targetIndex);
                }}
              />
            );
          })}
        </View>
      </ScrollView>
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
  submission,
  points,
  isWinner,
  voters,
  isLast,
  isCurrentTrack,
  isPlaying,
  onPress,
}: {
  submission: Submission;
  points: number;
  isWinner: boolean;
  voters: VoterRow[];
  isLast: boolean;
  isCurrentTrack: boolean;
  isPlaying: boolean;
  onPress: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Visible voters in the accordion: comment authors only (this screen is
  // about reading reactions, not about who voted how). Voter ordering kept
  // as-is from the RPC.
  const commenters = voters.filter((v) => (v.comment ?? "").trim().length > 0);
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
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        style={styles.row}
      >
        {submission.track_artwork_url ? (
          <ChromeBorder radius={8} thickness={1} clip style={styles.rowArt}>
            <Image
              source={{ uri: submission.track_artwork_url }}
              style={{ width: "100%", height: "100%" }}
            />
            {isCurrentTrack ? <PlayingIndicator isPlaying={isPlaying} /> : null}
          </ChromeBorder>
        ) : (
          <View style={[styles.rowArt, styles.rowArtPh]}>
            {isCurrentTrack ? <PlayingIndicator isPlaying={isPlaying} /> : null}
          </View>
        )}
        <View style={styles.rowMeta}>
          <View style={styles.rowTitleLine}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {submission.track_title}
            </Text>
            {isWinner ? (
              <ChromeText glyph="★" size={14} style={{ marginLeft: 4 }} />
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
      </TouchableOpacity>

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
    fontFamily: THEME.fonts.serifBoldItalic,
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
  dueLine: {
    fontFamily: THEME.fonts.sansSemi,
    fontSize: 13,
    lineHeight: 18,
    color: THEME.ink,
    textAlign: "center",
    paddingHorizontal: 28,
    marginBottom: 18,
  },
  heroDescription: {
    fontFamily: THEME.fonts.sansMedium,
    fontSize: 15,
    lineHeight: 20,
    color: "rgba(26,8,20,0.52)",
    textAlign: "center",
    marginTop: -1,
  },

  // Controls row
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 34,
    marginTop: 12,
    marginBottom: 14,
  },
  circleControl: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  circleControlMuted: {
    opacity: 0.45,
  },
  playControl: {
    minWidth: 155,
    height: 46,
    borderRadius: 23,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#050405",
  },
  playControlText: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 13,
    color: "#fff",
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 9,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "#fff",
    marginLeft: 2,
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
