// Full-screen "Now Playing" page — extracted from NowPlayingBar.tsx so the
// new floating pill (NowPlayingPillConnected) can render it without dragging
// in the legacy mini-bar layout. Logic mirrors the original; if behavior in
// the legacy NowPlayingBar evolves, port the change here too.
//
// Layout follows the Apple Music Now Playing reference: grab-handle bar up
// top (swipe to dismiss), large centered album art, left-aligned title /
// artist with a trailing "more" button, full-width scrubber (elapsed left,
// remaining right), and large plain transport controls. Typography + color
// stay on the bubblegum/iridescent theme used across the playlist + voting
// screens — the reference is the source for *arrangement*, the theme for
// *style*.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  LayoutAnimation,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FastForward,
  MessageCircle,
  MessageCircleMore,
  Minus,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Rewind,
} from 'lucide-react-native';
import { usePlayback } from '@/playback/PlaybackContext';
import { SwipeSheet } from '@/components/SwipeSheet';
import { Wallpaper } from '@/ui/Wallpaper';
import { ChromeBorder } from '@/ui/ChromeBorder';
import { ChromeButton } from '@/ui/ChromeButton';
import { ChromeText } from '@/ui/ChromeText';
import { PODIUM_STOPS } from '@/ui/metalStops';
import { THEME } from '@/ui/theme';
import { derivePhase } from '@/lib/utils/phase';
import { useSession } from '@/context/SessionContext';
import { useSubmissionRoundId } from '@/queries/useSubmissionRoundId';
import { useRound } from '@/queries/useRound';
import { useRoundResults } from '@/queries/useRoundResults';
import { useRoundVoters } from '@/queries/useRoundVoters';
import { useVotingDraft } from '@/queries/useVotingDraft';
import { MixError } from '@/services/errors';
import type { VoterEntry } from '@/services/results';

const { width: SCREEN_W } = Dimensions.get('window');

// Wash base lilac — used as the sheet's own background so the slide-up
// animation never flashes black before the Wallpaper paints over it.
const WASH_BASE = '#EDD7FF';

// Album art sizing. The layout always reserves the LARGE footprint so the
// title/artist line never shifts when the art resizes; the art itself scales
// (with a bounce) between large while playing and small while paused.
const ART_LARGE = SCREEN_W - 40; // playing — almost full-bleed (tighter gutters)
const ART_SMALL = Math.round(SCREEN_W * 0.68); // paused — slightly larger than before
const ART_SMALL_SCALE = ART_SMALL / ART_LARGE;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMs(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

// ─── SeekBar ──────────────────────────────────────────────────────────────────

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
  const [dragX, setDragX] = useState<number | null>(null);

  const displayProgress = dragX !== null
    ? Math.max(0, Math.min(dragX / barWidth, 1))
    : (durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0);
  const fillWidth = displayProgress * barWidth;

  const displayMs = dragX !== null
    ? Math.round(displayProgress * durationMs)
    : positionMs;
  const remainingMs = durationMs > 0 ? Math.max(0, durationMs - displayMs) : 0;

  const commitSeek = useCallback(
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
        // Refuse any parent's request to steal the gesture mid-drag. Without
        // this, the SwipeSheet's pan responder grabs the touch and fires
        // onResponderTerminate on us, which would clear dragX for one frame
        // and snap the thumb back to the underlying positionMs — the
        // flicker-back-to-start behavior. Releasing the touch still triggers
        // onResponderRelease normally.
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => setDragX(e.nativeEvent.locationX)}
        onResponderMove={(e) => setDragX(e.nativeEvent.locationX)}
        onResponderRelease={(e) => {
          commitSeek(e.nativeEvent.locationX);
          setDragX(null);
        }}
        onResponderTerminate={() => setDragX(null)}
      >
        <View style={seekStyles.track}>
          <View style={[seekStyles.fill, { width: fillWidth }]} />
        </View>
        <View style={[seekStyles.thumb, { left: Math.max(0, fillWidth - 7) }]} />
      </View>
      <View style={seekStyles.labels}>
        <Text style={seekStyles.time}>{formatMs(displayMs)}</Text>
        <Text style={seekStyles.time}>
          {durationMs > 0 ? `-${formatMs(remainingMs)}` : '--:--'}
        </Text>
      </View>
    </View>
  );
}

const seekStyles = StyleSheet.create({
  wrap: { width: '100%', gap: 8 },
  hitArea: { height: 28, justifyContent: 'center', width: '100%' },
  track: {
    height: 5,
    backgroundColor: 'rgba(26,8,20,0.14)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: { height: 5, backgroundColor: THEME.ink, borderRadius: 3 },
  thumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: THEME.ink,
    top: 7,
  },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  time: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: THEME.muted,
  },
});

// ─── Transport controls ───────────────────────────────────────────────────────

// Large, plain icon transport — no button backgrounds, matching the reference.
// Big play/pause flanked by skip-back / skip-forward; ink glyphs on the wash.
function Transport({
  isPlaying,
  onPlayPause,
  onPrevious,
  onNext,
  hasTrack,
  canPrevious,
  hasNext,
}: {
  isPlaying: boolean;
  onPlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  hasTrack: boolean;
  canPrevious: boolean;
  hasNext: boolean;
}) {
  return (
    <View style={ctrlStyles.row}>
      <TouchableOpacity
        onPress={onPrevious}
        disabled={!canPrevious}
        hitSlop={12}
        style={[ctrlStyles.skip, !canPrevious && ctrlStyles.disabled]}
      >
        <Rewind size={34} color={THEME.ink} fill={THEME.ink} strokeWidth={0} />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onPlayPause}
        disabled={!hasTrack}
        hitSlop={12}
        activeOpacity={0.7}
        style={[ctrlStyles.play, !hasTrack && ctrlStyles.disabled]}
      >
        {isPlaying ? (
          <Pause size={58} color={THEME.ink} fill={THEME.ink} strokeWidth={0} />
        ) : (
          <Play
            size={58}
            color={THEME.ink}
            fill={THEME.ink}
            strokeWidth={0}
            style={{ marginLeft: 4 }}
          />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onNext}
        disabled={!hasNext}
        hitSlop={12}
        style={[ctrlStyles.skip, !hasNext && ctrlStyles.disabled]}
      >
        <FastForward size={34} color={THEME.ink} fill={THEME.ink} strokeWidth={0} />
      </TouchableOpacity>
    </View>
  );
}

const ctrlStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
    marginTop: 4,
  },
  skip: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  play: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.3 },
});

// ─── Round panel (completed round) ──────────────────────────────────────────────

// Stable pastel for a voter avatar — same approach as PlaylistScreen so the
// read-only comments accordion reads identically across surfaces.
const AVATAR_PASTELS = [
  '#F5C8E2',
  '#E2C8F5',
  '#FFE3B8',
  '#C8E5C8',
  '#FFC8C8',
  '#C8DAEF',
  '#FFD7E8',
];
function pastelFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PASTELS[h % AVATAR_PASTELS.length];
}

// Completed-round panel: the track's playlist rank + total score, with a
// comment opener that expands the read-only voter comments (same data + shape
// as the PlaylistScreen accordion). The active-voting variant (inline
// steppers + comment composer) is intentionally not here yet — it needs a
// shared ballot draft to satisfy the all-or-nothing submit_votes contract.
function CompletedRoundPanel({
  rank,
  points,
  isVoid,
  comments,
}: {
  rank: number | null;
  points: number;
  isVoid: boolean;
  comments: VoterEntry[];
}) {
  const [expanded, setExpanded] = useState(false);
  const hasComments = comments.length > 0;

  const toggle = () => {
    if (!hasComments) return;
    LayoutAnimation.configureNext({
      duration: 180,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'easeInEaseOut' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    setExpanded((v) => !v);
  };

  return (
    <View style={roundStyles.wrap}>
      {/* Three equal columns so the score pill stays dead-center regardless of
          how wide the rank / comment content is (#3 vs #10, 1 vs 12 comments). */}
      <View style={roundStyles.statsRow}>
        <View style={roundStyles.statsSide}>
          {rank !== null ? (
            <View style={roundStyles.rankPill}>
              {rank <= 3 ? (
                <ChromeText
                  glyph="★"
                  size={13}
                  colors={PODIUM_STOPS[rank as 1 | 2 | 3]}
                />
              ) : null}
              <Text style={roundStyles.rankText}>#{rank}</Text>
            </View>
          ) : isVoid ? (
            <View style={roundStyles.rankPill}>
              <Text style={roundStyles.rankText}>Forfeited</Text>
            </View>
          ) : null}
        </View>

        <View style={roundStyles.statsCenter}>
          <View style={roundStyles.scorePill}>
            <Text style={roundStyles.scoreText}>{points}</Text>
            <Text style={roundStyles.scoreUnit}>
              {points === 1 ? 'pt' : 'pts'}
            </Text>
          </View>
        </View>

        <View style={roundStyles.statsSideRight}>
          <TouchableOpacity
            style={[roundStyles.commentBtn, !hasComments && { opacity: 0.3 }]}
            onPress={toggle}
            hitSlop={8}
            disabled={!hasComments}
          >
            {hasComments ? (
              <MessageCircleMore
                size={22}
                color={THEME.ink}
                fill={THEME.ink}
                strokeWidth={2}
                opacity={expanded ? 1 : 0.75}
              />
            ) : (
              <MessageCircle size={22} color={THEME.ink} strokeWidth={2} />
            )}
            {hasComments ? (
              <Text style={roundStyles.commentCount}>{comments.length}</Text>
            ) : null}
          </TouchableOpacity>
        </View>
      </View>

      {expanded && hasComments ? (
        <ScrollView
          style={roundStyles.accordion}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {comments.map((v, i) => (
            <View key={v.voter_user_id}>
              {i > 0 ? <View style={roundStyles.accordionDivider} /> : null}
              <View style={roundStyles.commentRow}>
                <ChromeBorder
                  radius={13}
                  thickness={1.5}
                  innerBg={pastelFor(v.voter_user_id)}
                  clip
                  style={roundStyles.commentAvatar}
                >
                  <View style={roundStyles.commentAvatarCenter}>
                    <Text style={roundStyles.commentAvatarInitial}>
                      {(v.voter_name ?? '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                </ChromeBorder>
                <View style={roundStyles.commentTextCol}>
                  <Text style={roundStyles.commentVoterName} numberOfLines={1}>
                    {v.voter_name}
                  </Text>
                  <Text style={roundStyles.commentText}>
                    &ldquo;{v.comment}&rdquo;
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const roundStyles = StyleSheet.create({
  wrap: { width: '100%', gap: 10 },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Equal side/center columns keep the score pill centered on screen no matter
  // how wide the rank or comment content is.
  statsSide: { flex: 1, alignItems: 'flex-start' },
  statsCenter: { flexShrink: 0, alignItems: 'center', paddingHorizontal: 8 },
  statsSideRight: { flex: 1, alignItems: 'flex-end' },
  rankPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#2a0e4a',
  },
  rankText: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 12,
    color: '#e8d5ff',
  },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(26,8,20,0.06)',
  },
  scoreText: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 13,
    color: THEME.ink,
  },
  scoreUnit: {
    fontFamily: THEME.fonts.sansMedium,
    fontSize: 11,
    color: THEME.muted,
  },
  commentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  commentCount: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 12,
    color: THEME.ink,
  },
  accordion: {
    width: '100%',
    maxHeight: 168,
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderRadius: 12,
  },
  accordionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(26,8,20,0.12)',
    marginLeft: 36,
  },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  commentAvatar: { width: 26, height: 26 },
  commentAvatarCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  commentAvatarInitial: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 11,
    color: THEME.ink,
  },
  commentTextCol: { flex: 1, gap: 1 },
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
});

// ─── Album art swiper ──────────────────────────────────────────────────────────

function AlbumArtSwiper() {
  const { currentIndex, playlist, artworkUrl, isPlaying, next, previous } = usePlayback();
  const translateX = useRef(new Animated.Value(0)).current;

  // A single `progress` value (0 = paused/small, 1 = playing/large) drives both
  // the scale and the shadow so they stay in step: the art "lifts" off the
  // surface — shadow fading in as it grows, gone when it sits small and flat.
  // Kept on the NATIVE driver (transform + opacity only) for smoothness — the
  // shadow fade is done by cross-fading a separate shadow plate's opacity
  // rather than animating shadowOpacity (which would force the JS driver and
  // stutter). Scale overshoots past 1 on grow for a slight spring; no
  // undershoot on shrink. The swiper window is `overflow: visible` so the grow
  // overshoot is never clipped.
  const progress = useRef(new Animated.Value(isPlaying ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(progress, {
      toValue: isPlaying ? 1 : 0,
      speed: isPlaying ? 4 : 6,
      bounciness: isPlaying ? 13 : 0,
      useNativeDriver: true,
    }).start();
  }, [isPlaying, progress]);

  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [ART_SMALL_SCALE, 1],
  });
  const shadowFade = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const artCache = useRef(new Map<string, string>());

  useEffect(() => {
    if (currentIndex !== null && artworkUrl) {
      artCache.current.set(playlist[currentIndex].id, artworkUrl);
    }
  }, [artworkUrl, currentIndex, playlist]);

  useEffect(() => {
    if (currentIndex === null) return;
    const neighbors = [
      currentIndex > 0 ? playlist[currentIndex - 1] : null,
      currentIndex < playlist.length - 1 ? playlist[currentIndex + 1] : null,
    ];
    for (const track of neighbors) {
      if (!track) continue;
      const url = artCache.current.get(track.id) || track.artworkUrl;
      if (url) void Image.prefetch(url);
    }
  }, [currentIndex, playlist]);

  const getArtUrl = (index: number): string => {
    if (index < 0 || index >= playlist.length) return '';
    const track = playlist[index];
    return artCache.current.get(track.id) || track.artworkUrl || '';
  };

  const hasNextRef = useRef(false);
  const hasPrevRef = useRef(false);
  const nextFnRef = useRef(next);
  const prevFnRef = useRef(previous);
  hasNextRef.current = currentIndex !== null && currentIndex < playlist.length - 1;
  hasPrevRef.current = currentIndex !== null && currentIndex > 0;
  nextFnRef.current = next;
  prevFnRef.current = previous;

  const prevArt = hasPrevRef.current && currentIndex !== null ? getArtUrl(currentIndex - 1) : '';
  const currentArt = (currentIndex !== null ? getArtUrl(currentIndex) : '') || artworkUrl || '';
  const nextArt = hasNextRef.current && currentIndex !== null ? getArtUrl(currentIndex + 1) : '';

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onPanResponderTerminationRequest: () => true,
      onPanResponderMove: (_, { dx }) => {
        const blocked = dx < 0 ? !hasNextRef.current : !hasPrevRef.current;
        translateX.setValue(blocked ? dx * 0.15 : dx);
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        const THRESHOLD = SCREEN_W * 0.3;
        if ((dx < -THRESHOLD || vx < -0.6) && hasNextRef.current) {
          const dur = Math.max(100, Math.min(250, (SCREEN_W - Math.abs(dx)) / Math.max(Math.abs(vx), 0.3)));
          Animated.timing(translateX, { toValue: -SCREEN_W, duration: dur, useNativeDriver: true })
            .start(({ finished }) => {
              if (!finished) return;
              nextFnRef.current();
              translateX.setValue(0);
            });
        } else if ((dx > THRESHOLD || vx > 0.6) && hasPrevRef.current) {
          const dur = Math.max(100, Math.min(250, (SCREEN_W - Math.abs(dx)) / Math.max(Math.abs(vx), 0.3)));
          Animated.timing(translateX, { toValue: SCREEN_W, duration: dur, useNativeDriver: true })
            .start(({ finished }) => {
              if (!finished) return;
              prevFnRef.current();
              translateX.setValue(0);
            });
        } else {
          Animated.spring(translateX, { toValue: 0, damping: 25, stiffness: 300, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, damping: 25, stiffness: 300, useNativeDriver: true }).start();
      },
    }),
  ).current;

  const renderArt = (url: string, key: string) => (
    <View key={key} style={artSwiperStyles.panel}>
      <Animated.View style={[artSwiperStyles.artScaleWrap, { transform: [{ scale }] }]}>
        {/* Separate shadow plate behind the art — its opacity cross-fades on
            the native driver (smooth) so the shadow only shows once lifted. */}
        <Animated.View
          style={[artSwiperStyles.artShadowPlate, { opacity: shadowFade }]}
          pointerEvents="none"
        />
        <View style={artSwiperStyles.artFrame}>
          {url ? (
            <Image source={{ uri: url }} style={artSwiperStyles.art} />
          ) : (
            <View style={[artSwiperStyles.art, artSwiperStyles.placeholder]}>
              <ChromeText glyph="♪" size={72} />
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );

  return (
    <View style={artSwiperStyles.window} {...panResponder.panHandlers}>
      <Animated.View
        style={[
          artSwiperStyles.row,
          { transform: [{ translateX: Animated.add(translateX, new Animated.Value(-SCREEN_W)) }] },
        ]}
      >
        {renderArt(prevArt, 'prev')}
        {renderArt(currentArt, 'current')}
        {renderArt(nextArt, 'next')}
      </Animated.View>
    </View>
  );
}

const artSwiperStyles = StyleSheet.create({
  // `visible` (not hidden) so the grow spring's slight overshoot isn't clipped.
  // The off-screen prev/next panels sit exactly one screen-width away, so the
  // device edge clips them — no neighbour peeking at rest.
  window: { width: SCREEN_W, overflow: 'visible' },
  row: { flexDirection: 'row', width: SCREEN_W * 3 },
  panel: { width: SCREEN_W, alignItems: 'center', justifyContent: 'center' },
  artScaleWrap: {
    width: ART_LARGE,
    height: ART_LARGE,
  },
  // Soft, modern drop shadow — on-theme plum rather than hard black, with a
  // wide blur and gentle offset so it reads as a smooth lift off the wash. Its
  // own opacity is cross-faded (native driver) so the shadow only shows once
  // the art has lifted to the large size. The wash-colored backing lets the
  // rounded shadow render cleanly; it's fully covered by the art on top.
  artShadowPlate: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    backgroundColor: WASH_BASE,
    shadowColor: '#1A0814',
    shadowOpacity: 0.3,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  artFrame: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  art: { width: '100%', height: '100%' },
  placeholder: {
    backgroundColor: 'rgba(26,8,20,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Voting panel (active round) ────────────────────────────────────────────────

type VotingDraftApi = ReturnType<typeof useVotingDraft>;

// Vote-as-you-listen: steppers for the *current* track that build a shared,
// server-persisted ballot draft (the same draft the voting screen edits). The
// whole budget is spent across the playlist as you go; "Submit ballot" lights
// up only when every point is allocated. Read-only once the ballot is in.
function VotingPanel({ draft, subId }: { draft: VotingDraftApi; subId: string }) {
  const [composerOpen, setComposerOpen] = useState(false);
  const pts = draft.points(subId);
  const own = draft.isOwn(subId);
  const commentText = draft.comment(subId);

  const onSubmit = useCallback(async () => {
    try {
      await draft.submitBallot();
    } catch (e) {
      Alert.alert('Submit failed', e instanceof MixError ? e.message : 'Unknown error');
    }
  }, [draft]);

  // Locked, read-only view once the user has voted.
  if (draft.alreadyVoted) {
    return (
      <View style={voteStyles.card}>
        <View style={voteStyles.headerRow}>
          <Text style={voteStyles.label}>Your vote</Text>
          <Text style={voteStyles.savedHint}>Locked in ✓</Text>
        </View>
        <View style={voteStyles.votedRow}>
          <Text style={voteStyles.votedText}>
            {own
              ? 'Your track'
              : pts > 0
                ? 'You gave this track'
                : 'No points on this track'}
          </Text>
          {!own && pts > 0 ? (
            <View style={voteStyles.ptsPill}>
              <Text style={voteStyles.ptsPillText}>+{pts}</Text>
            </View>
          ) : null}
        </View>
        {!own && commentText.trim().length > 0 ? (
          <Text style={voteStyles.votedComment}>
            &ldquo;{commentText.trim()}&rdquo;
          </Text>
        ) : null}
      </View>
    );
  }

  // Not editable yet (draft still hydrating, or not eligible) → render nothing.
  if (!draft.canEdit) return null;

  const plusDisabled = draft.remaining === 0 || pts >= draft.maxPerTrack;

  return (
    <View style={voteStyles.card}>
      <View style={voteStyles.headerRow}>
        <Text style={voteStyles.label}>Your vote</Text>
        <Text style={voteStyles.savedHint}>
          {draft.saving ? 'Saving…' : draft.dirty ? 'Saving…' : 'Saved'}
        </Text>
      </View>

      {own ? (
        <Text style={voteStyles.ownNote}>You can&apos;t vote for your own track.</Text>
      ) : (
        <>
          <View style={voteStyles.stepperRow}>
            <TouchableOpacity
              style={[voteStyles.stepBtn, pts === 0 && voteStyles.stepDisabled]}
              onPress={() => draft.adjust(subId, -1)}
              disabled={pts === 0}
              hitSlop={8}
            >
              <Minus size={22} color={THEME.ink} strokeWidth={3} />
            </TouchableOpacity>
            <View style={voteStyles.ptsBox}>
              <Text style={voteStyles.ptsNum}>{pts}</Text>
              <Text style={voteStyles.ptsUnit}>{pts === 1 ? 'pt' : 'pts'}</Text>
            </View>
            <TouchableOpacity
              style={[voteStyles.stepBtn, plusDisabled && voteStyles.stepDisabled]}
              onPress={() => draft.adjust(subId, 1)}
              disabled={plusDisabled}
              hitSlop={8}
            >
              <Plus size={22} color={THEME.ink} strokeWidth={3} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={voteStyles.commentToggle}
            onPress={() => setComposerOpen((v) => !v)}
            hitSlop={6}
          >
            {commentText.trim().length > 0 ? (
              <MessageCircleMore
                size={18}
                color={THEME.ink}
                fill={THEME.ink}
                strokeWidth={2}
              />
            ) : (
              <MessageCircle size={18} color={THEME.ink} strokeWidth={2} />
            )}
            <Text style={voteStyles.commentToggleText}>
              {commentText.trim().length > 0 ? 'Edit comment' : 'Add a comment'}
            </Text>
          </TouchableOpacity>

          {composerOpen ? (
            <TextInput
              style={voteStyles.composer}
              value={commentText}
              onChangeText={(v) => draft.setComment(subId, v)}
              placeholder="Leave a comment for this track…"
              placeholderTextColor={THEME.faint}
              multiline
              textAlignVertical="top"
            />
          ) : null}
        </>
      )}

      <Text style={voteStyles.budget}>
        {draft.remaining} of {draft.total} pts left · max {draft.maxPerTrack}/track
      </Text>

      <ChromeButton
        onPress={onSubmit}
        disabled={!draft.canSubmit}
        radius={22}
        paddingVertical={12}
      >
        <Text style={voteStyles.submitText}>
          {draft.submitting
            ? 'Submitting…'
            : draft.remaining === 0
              ? 'Submit ballot'
              : `Spend ${draft.remaining} more to submit`}
        </Text>
      </ChromeButton>
    </View>
  );
}

const voteStyles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: THEME.ink,
  },
  savedHint: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 9.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: THEME.faint,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(26,8,20,0.07)',
  },
  stepDisabled: { opacity: 0.3 },
  ptsBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    minWidth: 64,
    justifyContent: 'center',
  },
  ptsNum: {
    fontFamily: THEME.fonts.serifBoldItalic,
    fontSize: 30,
    color: THEME.ink,
  },
  ptsUnit: {
    fontFamily: THEME.fonts.sansMedium,
    fontSize: 12,
    color: THEME.muted,
  },
  ownNote: {
    fontFamily: THEME.fonts.sansMedium,
    fontSize: 13,
    color: THEME.muted,
    textAlign: 'center',
  },
  commentToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  commentToggleText: {
    fontFamily: THEME.fonts.sansSemi,
    fontSize: 13,
    color: THEME.ink,
  },
  composer: {
    minHeight: 56,
    maxHeight: 96,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.65)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: THEME.fonts.sansMedium,
    fontSize: 14,
    color: THEME.ink,
  },
  budget: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: THEME.muted,
    textAlign: 'center',
  },
  submitText: {
    fontFamily: THEME.fonts.sansSemi,
    fontSize: 14,
    color: THEME.ink,
  },
  votedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  votedText: {
    fontFamily: THEME.fonts.sansMedium,
    fontSize: 14,
    color: THEME.ink,
  },
  ptsPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#2a0e4a',
  },
  ptsPillText: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 12,
    color: '#e8d5ff',
  },
  votedComment: {
    fontFamily: THEME.fonts.serifItalic,
    fontSize: 13,
    lineHeight: 17,
    color: THEME.muted,
    textAlign: 'center',
  },
});

// ─── Modal ────────────────────────────────────────────────────────────────────

export function NowPlayingModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const {
    currentIndex, playlist,
    isPlaying, positionMs, durationMs, title, artist,
    pause, resume, seek, next, previous,
  } = usePlayback();

  const hasTrack = currentIndex !== null;
  // Back is enabled whenever a track is loaded — `previous()` now does the
  // standard music-player thing of restarting from 0 if pressed after the
  // first ~2s of playback, falling through to a previous track otherwise.
  const canPrevious = currentIndex !== null;
  const hasNext = currentIndex !== null && currentIndex < playlist.length - 1;

  // ── Round context for the current track ──
  // A PlaylistTrack.id is a submission id; resolve it to its round, derive the
  // phase, and (when complete) surface the track's rank / score / comments.
  const currentSubId = currentIndex !== null ? playlist[currentIndex]?.id : undefined;
  const { supabaseUserId } = useSession();
  const { data: roundId } = useSubmissionRoundId(currentSubId);
  const { data: round } = useRound(roundId ?? undefined);
  const phase = round ? derivePhase(round) : null;

  // Active-round voting facade (steppers + comment + submit) for the current
  // track. Shares the persisted draft with the voting screen.
  const draft = useVotingDraft(roundId ?? undefined, supabaseUserId ?? undefined);
  const showVoting = phase === 'voting' && draft.didSubmit && !!currentSubId;
  // Only pull results/voters once the round is complete — during voting these
  // would be a spoiler (and a wasted fetch).
  const resultsRoundId = phase === 'results' ? roundId ?? undefined : undefined;
  const { data: results = [] } = useRoundResults(resultsRoundId);
  const { data: voters = {} } = useRoundVoters(resultsRoundId);

  const completed = useMemo(() => {
    if (phase !== 'results' || !currentSubId) return null;
    const me = results.find((r) => r.submission_id === currentSubId);
    // Rank = position among non-forfeited tracks, by effective points (raw as
    // tiebreaker, id for stability) — mirrors the results/playlist screens.
    const eligible = results
      .filter((r) => !r.is_void)
      .sort(
        (a, b) =>
          b.points_effective - a.points_effective ||
          b.points_raw - a.points_raw ||
          a.submission_id.localeCompare(b.submission_id),
      );
    const idx = eligible.findIndex((r) => r.submission_id === currentSubId);
    const trackComments = (voters[currentSubId] ?? []).filter(
      (v) => (v.comment ?? '').trim().length > 0,
    );
    return {
      rank: idx >= 0 ? idx + 1 : null,
      points: me?.points_effective ?? 0,
      isVoid: me?.is_void ?? false,
      comments: trackComments,
    };
  }, [phase, currentSubId, results, voters]);

  return (
    <SwipeSheet
      visible={visible}
      onRequestClose={onClose}
      closeDuration={300}
      dismissThreshold={80}
      dismissVelocityThreshold={0.5}
      backgroundColor={WASH_BASE}
      backdropColor="rgba(26,8,20,0.4)"
      // Hide the built-in handle strip so the iridescent wash can cover the
      // full sheet edge-to-edge (the strip would otherwise sit on the flat
      // sheet background, leaving a seam where the wash blooms begin). We
      // render our own grab handle inside the Wallpaper below.
      showHandle={false}
    >
      {() => (
        <Wallpaper halftone={false}>
          {/* Grab handle — signals swipe-to-dismiss. */}
          <View style={[modalStyles.topBar, { paddingTop: insets.top + 10 }]}>
            <View style={modalStyles.handle} />
          </View>

          <View style={[modalStyles.content, { paddingBottom: insets.bottom + 18 }]}>
            <View style={modalStyles.artBlock}>
              <AlbumArtSwiper />
            </View>

            {/* Everything under the art. The title is pinned just below the
                (large) art footprint so it never shifts when the art scales;
                the controls + scrubber float vertically centered in the space
                between the title and the bottom panel. */}
            <View style={modalStyles.belowArt}>
              <View style={modalStyles.titleRow}>
                <View style={modalStyles.titleCol}>
                  <Text style={modalStyles.title} numberOfLines={1}>
                    {title || (hasTrack ? 'Loading…' : 'Nothing playing')}
                  </Text>
                  {artist ? (
                    <Text style={modalStyles.artist} numberOfLines={1}>
                      {artist}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={modalStyles.moreBtn}
                  hitSlop={8}
                  // TODO: overflow menu (add to playlist, share, view round…).
                  onPress={() => {}}
                >
                  <MoreHorizontal size={20} color={THEME.ink} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>

              <View style={modalStyles.controlsRegion}>
                {/* Transport sits above the scrubber per the requested layout. */}
                <Transport
                  isPlaying={isPlaying}
                  onPlayPause={isPlaying ? pause : resume}
                  onPrevious={previous}
                  onNext={next}
                  hasTrack={hasTrack}
                  canPrevious={canPrevious}
                  hasNext={hasNext}
                />

                <SeekBar positionMs={positionMs} durationMs={durationMs} onSeek={seek} />
              </View>

              {completed ? (
                <CompletedRoundPanel
                  rank={completed.rank}
                  points={completed.points}
                  isVoid={completed.isVoid}
                  comments={completed.comments}
                />
              ) : null}

              {showVoting ? (
                <VotingPanel draft={draft} subId={currentSubId!} />
              ) : null}
            </View>
          </View>
        </Wallpaper>
      )}
    </SwipeSheet>
  );
}

const modalStyles = StyleSheet.create({
  topBar: {
    alignItems: 'center',
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(26,8,20,0.22)',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 8,
  },
  artBlock: {
    alignItems: 'center',
    marginTop: 8,
  },
  // Fills the space under the art. Title pinned at the top, controls centered
  // in the middle (controlsRegion flex:1), any round panel at the bottom.
  belowArt: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 30,
  },
  controlsRegion: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 18,
    width: '100%',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 36,
  },
  titleCol: { flex: 1, minWidth: 0, gap: 3 },
  title: {
    fontFamily: THEME.fonts.serifBoldItalic,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.6,
    color: THEME.ink,
  },
  artist: {
    fontFamily: THEME.fonts.sansMedium,
    fontSize: 15,
    color: THEME.muted,
  },
  moreBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(26,8,20,0.06)',
  },
});
