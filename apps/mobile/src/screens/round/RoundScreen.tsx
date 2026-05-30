import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
  Image,
  Animated,
  LayoutAnimation,
  UIManager,
  useWindowDimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import {
  ChevronUp,
  ChevronDown,
  MessageCircle,
  MessageCircleMore,
} from "lucide-react-native";
import { imageForKey, toneForKey } from "@/ui/theme/images";
import { videoForKey } from "@/ui/theme/videos";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Wallpaper } from "@/ui/Wallpaper";
import { ChromeText } from "@/ui/ChromeText";
import { ChromeBorder } from "@/ui/ChromeBorder";
import { ChromeButton } from "@/ui/ChromeButton";
import { HaloText } from "@/ui/HaloText";
import { FittedChromeTitle } from "@/ui/FittedChromeTitle";
import { useSession } from "@/context/SessionContext";
import { useRoundSubmissions } from "@/queries/useRoundSubmissions";
import { useMyVotes } from "@/queries/useMyVotes";
import { useSubmitVotes } from "@/queries/useSubmitVotes";
import { useSubmitRoundEntries } from "@/queries/useSubmitRoundEntries";
import { useRound } from "@/queries/useRound";
import { usePreviousRound } from "@/queries/usePreviousRound";
import { useRoundCountForSeason } from "@/queries/useRoundCountForSeason";
import { useLeague } from "@/queries/useLeague";
import { useMyRole } from "@/queries/useMyRole";
import { useRoundResults } from "@/queries/useRoundResults";
import { useRoundVoters } from "@/queries/useRoundVoters";
import { useForceEndRound } from "@/queries/useForceEndRound";
import { MixError } from "@/services/errors";
import type { VoteInput, VoteCommentInput } from "@/services/votes";
import type { SubmissionDraft } from "@/services/submissions";
import {
  searchSpotifyTracks,
  getSpotifyTrack,
  extractSpotifyTrackId,
} from "@/services/spotifySearch";
import {
  isSoundCloudTrackUrl,
  resolveSoundCloudTrack,
  type SoundCloudTrack,
} from "@/services/soundcloudResolve";
import { THEME } from "@/ui/theme";
import { PageHeader } from "@/ui/PageHeader";
import { HeroBanner } from "@/ui/cards/HeroBanner";
import { TrackList, type TrackListItem } from "@/ui/sections/TrackList";
import { useTabBarBottomInset } from "@/ui/hooks/useTabBarBottomInset";
import { derivePhase, formatPhaseCountdown } from "@/lib/utils/phase";
import { roundCoverKey } from "@/lib/utils/coverKey";
import { usePlayback, type PlaylistTrack } from "@/playback/PlaybackContext";
import { normalizeSpotifyTrackUri } from "@/lib/spotifyTrackUri";

// ─── Types ────────────────────────────────────────────────────────────────────

type Round = {
  id: string;
  round_number: number;
  prompt: string;
  description: string;
  submission_deadline_at: string;
  voting_deadline_at: string;
  season_id: string;
  seasons: {
    id: string;
    name: string;
    status: string;
    submissions_per_user: number;
    default_points_per_round: number;
    default_max_points_per_track: number;
    league_id: string;
  } | null;
};

type SiblingRound = {
  id: string;
  round_number: number;
  prompt: string;
  voting_deadline_at: string;
};

type Submission = {
  id: string;
  user_id: string;
  track_title: string;
  track_artist: string;
  track_artwork_url: string | null;
  track_source: "spotify" | "soundcloud";
  spotify_track_id: string | null;
  soundcloud_track_url: string | null;
  track_isrc: string;
  comment: string | null;
};

type SpotifyTrack = {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  duration_ms: number;
  external_ids: { isrc?: string };
  popularity: number;
};

// Discriminated track shape used by the picker UI for both search results and
// the committed slot. Whichever streaming source the user picked, the
// downstream submit logic dispatches on `source` to populate the right DB
// columns. The Spotify branch keeps the full SDK shape so we have ISRC,
// popularity, etc. on hand for analytics. The SoundCloud branch only has what
// oEmbed gives us.
type PickedTrack =
  | { source: "spotify"; data: SpotifyTrack }
  | { source: "soundcloud"; data: SoundCloudTrack };

function pickedId(t: PickedTrack): string {
  return t.source === "spotify" ? t.data.id : t.data.url;
}
function pickedTitle(t: PickedTrack): string {
  return t.source === "spotify" ? t.data.name : t.data.title;
}
function pickedArtist(t: PickedTrack): string {
  return t.source === "spotify"
    ? t.data.artists.map((a) => a.name).join(", ")
    : t.data.artist;
}
function pickedArtwork(t: PickedTrack): string | null {
  return t.source === "spotify"
    ? (t.data.album.images[0]?.url ?? null)
    : t.data.artworkUrl;
}

type DraftSubmission = {
  submissionId: string | null;
  track: PickedTrack | null;
  comment: string;
  searchInput: string;
  searchResults: PickedTrack[];
  isSearching: boolean;
  isEditingTrack: boolean;
  trackLimitError: { durationMs: number } | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDeadline(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDurationMs(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function submissionToTrack(submission: Submission): PickedTrack {
  if (submission.track_source === "soundcloud" && submission.soundcloud_track_url) {
    return {
      source: "soundcloud",
      data: {
        url: submission.soundcloud_track_url,
        title: submission.track_title,
        artist: submission.track_artist,
        artworkUrl: submission.track_artwork_url,
      },
    };
  }
  // Default: Spotify-shaped (covers existing rows whose track_source defaults
  // to 'spotify' even if the column wasn't populated yet).
  return {
    source: "spotify",
    data: {
      id: submission.spotify_track_id ?? submission.id,
      name: submission.track_title,
      artists: submission.track_artist
        .split(",")
        .map((artist) => ({ name: artist.trim() }))
        .filter((artist) => artist.name.length > 0),
      album: {
        name: "",
        images: submission.track_artwork_url
          ? [{ url: submission.track_artwork_url }]
          : [],
      },
      duration_ms: 0,
      external_ids: { isrc: submission.track_isrc },
      popularity: 0,
    },
  };
}

function createDraftSubmission(
  existing: Submission | undefined,
  autoExpand: boolean,
): DraftSubmission {
  return {
    submissionId: existing?.id ?? null,
    track: existing ? submissionToTrack(existing) : null,
    comment: existing?.comment ?? "",
    searchInput: "",
    searchResults: [],
    isSearching: false,
    // Filled slots show their track; empty slots collapse into "+ ADD PICK NN"
    // placeholders. The first empty slot auto-expands so the editor is ready
    // without an extra tap.
    isEditingTrack: existing ? false : autoExpand,
    trackLimitError: null,
  };
}

function comparableDraft(draft: DraftSubmission) {
  return {
    trackId: draft.track ? pickedId(draft.track) : null,
    comment: draft.comment.trim(),
  };
}

function submissionToPlaylistTrack(s: Submission): PlaylistTrack | null {
  if (s.track_source === "soundcloud" && s.soundcloud_track_url) {
    return {
      id: s.id,
      source: "soundcloud",
      uri: s.soundcloud_track_url,
      title: s.track_title,
      artist: s.track_artist,
      artworkUrl: s.track_artwork_url ?? "",
      durationMs: 0,
    };
  }
  if (s.spotify_track_id) {
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
  return null;
}

function shuffled<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ─── Themed Button ────────────────────────────────────────────────────────────

function ThemedButton({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
}) {
  const palette = {
    primary: { bg: THEME.ink, fg: "#fff" },
    secondary: { bg: "transparent", fg: THEME.ink },
    danger: { bg: "transparent", fg: THEME.accent },
  }[variant];
  const borderStyle =
    variant === "primary"
      ? null
      : { borderWidth: StyleSheet.hairlineWidth, borderColor: THEME.rule };
  return (
    <TouchableOpacity
      style={[
        styles.themedBtn,
        { backgroundColor: palette.bg },
        borderStyle,
        disabled && { opacity: 0.4 },
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Text style={[styles.themedBtnText, { color: palette.fg }]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// ─── Track row (submission / voting phases) ───────────────────────────────────

function TrackRow({
  title,
  artist,
  artwork,
  compact,
}: {
  title: string;
  artist: string;
  artwork: string | null;
  compact?: boolean;
}) {
  const size = compact ? 40 : 52;
  return (
    <View style={styles.trackRow}>
      {artwork ? (
        <Image
          source={{ uri: artwork }}
          style={[
            styles.artwork,
            { width: size, height: size, borderRadius: compact ? 4 : 6 },
          ]}
        />
      ) : (
        <View
          style={[
            styles.artworkPlaceholder,
            { width: size, height: size, borderRadius: compact ? 4 : 6 },
          ]}
        />
      )}
      <View style={styles.trackMeta}>
        <Text
          style={[styles.trackTitle, compact && { fontSize: 13 }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          style={[styles.trackArtist, compact && { fontSize: 11 }]}
          numberOfLines={1}
        >
          {artist}
        </Text>
      </View>
    </View>
  );
}

// ─── Submission phase ─────────────────────────────────────────────────────────
// Bubblegum redesign: hot-pink wallpaper, big italic round-prompt hero,
// chrome glyph accents, baby-pink pick cards. See `ui/theme/bubblegum.ts`
// for the token spec; matches Claude Design's Submit screen mock.

const MAX_TRACK_DURATION_MS = 27 * 60 * 1000;

function TrackLimitBanner({
  durationMs,
  onDismiss,
}: {
  durationMs: number;
  onDismiss: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 90,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  const handleDismiss = () => {
    Animated.timing(opacity, {
      toValue: 0,
      duration: 40,
      useNativeDriver: true,
    }).start(() => {
      LayoutAnimation.configureNext({
        duration: 100,
        update: { type: "easeInEaseOut" },
        delete: { type: "easeInEaseOut", property: "opacity" },
      });
      onDismiss();
    });
  };

  return (
    <Animated.View style={[styles.trackLimitBanner, { opacity }]}>
      <View style={styles.trackLimitBannerRow}>
        <View style={styles.trackLimitBannerLeft}>
          <View style={styles.trackLimitTagRow}>
            <Text style={styles.trackLimitTag}>TOO LONG</Text>
            <Text style={styles.trackLimitDuration}>
              {formatDurationMs(durationMs)}
            </Text>
          </View>
          <Text style={styles.trackLimitHint}>
            max {formatDurationMs(MAX_TRACK_DURATION_MS)} · try a shorter track
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleDismiss}
          hitSlop={12}
          style={styles.trackLimitDismiss}
        >
          <Text style={styles.trackLimitDismissGlyph}>×</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

function SubmissionPhase({
  round,
  userId,
  mySubmissions,
  onSubmitted,
}: {
  round: Round;
  userId: string;
  mySubmissions: Submission[];
  onSubmitted: () => void;
}) {
  const submissionsPerUser = round.seasons?.submissions_per_user ?? 1;
  const [drafts, setDrafts] = useState<DraftSubmission[]>([]);
  const searchRequestIds = useRef<Record<number, number>>({});
  const submitMutation = useSubmitRoundEntries();
  const submitting = submitMutation.isPending;

  const baselineDrafts = useMemo(() => {
    // Auto-expand the *first* empty slot so the user lands directly in the
    // editor. Subsequent empty slots collapse into "+ ADD PICK" buttons.
    let didAutoExpand = false;
    return Array.from({ length: submissionsPerUser }, (_, i) => {
      const existing = mySubmissions[i];
      const autoExpand = !existing && !didAutoExpand;
      if (autoExpand) didAutoExpand = true;
      return createDraftSubmission(existing, autoExpand);
    });
  }, [mySubmissions, submissionsPerUser]);
  const searchDebounceKeys = useMemo(
    () =>
      drafts.map((draft) => `${draft.isEditingTrack}:${draft.searchInput}`).join("|"),
    [drafts],
  );
  const searchableDrafts = useMemo(
    () =>
      drafts.map((draft) => ({
        isEditingTrack: draft.isEditingTrack,
        searchInput: draft.searchInput,
      })),
    [searchDebounceKeys],
  );

  useEffect(() => {
    setDrafts(baselineDrafts);
  }, [baselineDrafts]);

  const updateComment = (slotIndex: number, comment: string) => {
    setDrafts((prev) =>
      prev.map((draft, i) => (i === slotIndex ? { ...draft, comment } : draft)),
    );
  };

  const setSearchState = useCallback(
    (slotIndex: number, patch: Partial<DraftSubmission>) => {
      setDrafts((prev) =>
        prev.map((draft, i) =>
          i === slotIndex ? { ...draft, ...patch } : draft,
        ),
      );
    },
    [],
  );

  const runSearch = useCallback(
    async (slotIndex: number, value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        setSearchState(slotIndex, { isSearching: false, searchResults: [] });
        return;
      }

      const requestId = (searchRequestIds.current[slotIndex] ?? 0) + 1;
      searchRequestIds.current[slotIndex] = requestId;
      setSearchState(slotIndex, { isSearching: true });

      try {
        let nextResults: PickedTrack[];
        // Anything that looks like a URL is treated as URL-mode: we never run
        // a Spotify text search on a link (otherwise pasting "https://..."
        // returns garbage Spotify hits matching the literal URL string).
        const looksLikeUrl = /^https?:\/\//i.test(trimmed);
        if (isSoundCloudTrackUrl(trimmed)) {
          // SoundCloud link paste (including share short links) — resolve via
          // oEmbed and surface as a single preview result.
          const sc = await resolveSoundCloudTrack(trimmed);
          nextResults = [{ source: "soundcloud", data: sc }];
        } else if (looksLikeUrl) {
          // Could still be a Spotify track URL — handle that. Any other URL
          // (Apple Music, YouTube, random) returns an empty result set rather
          // than falling through to text search.
          const spotifyId = extractSpotifyTrackId(trimmed);
          if (spotifyId) {
            const t = await getSpotifyTrack(spotifyId);
            nextResults = [{ source: "spotify", data: t }];
          } else {
            nextResults = [];
          }
        } else {
          // Plain text query → Spotify search.
          const spotifyResults = await searchSpotifyTracks(trimmed);
          nextResults = spotifyResults.map((t) => ({
            source: "spotify" as const,
            data: t,
          }));
        }

        if (searchRequestIds.current[slotIndex] !== requestId) return;
        setSearchState(slotIndex, {
          searchResults: nextResults,
          isSearching: false,
        });
      } catch (err) {
        if (searchRequestIds.current[slotIndex] !== requestId) return;
        setSearchState(slotIndex, { isSearching: false, searchResults: [] });
        const message = err instanceof MixError ? err.message : "Unknown error";
        Alert.alert("Search failed", message);
      }
    },
    [setSearchState],
  );

  useEffect(() => {
    const timeouts = searchableDrafts.map((draft, index) => {
      if (!draft.isEditingTrack) return null;
      const trimmed = draft.searchInput.trim();
      if (!trimmed) return null;

      const timeout = setTimeout(() => {
        void runSearch(index, draft.searchInput);
      }, 350);

      return timeout;
    });

    return () => {
      timeouts.forEach((timeout) => {
        if (timeout) clearTimeout(timeout);
      });
    };
  }, [runSearch, searchableDrafts]);

  const updateSearchInput = (slotIndex: number, searchInput: string) => {
    setSearchState(slotIndex, {
      searchInput,
      trackLimitError: null,
      ...(searchInput.trim()
        ? {}
        : { searchResults: [], isSearching: false }),
    });
  };

  const selectTrack = (slotIndex: number, track: PickedTrack) => {
    if (track.source === "spotify" && track.data.duration_ms > MAX_TRACK_DURATION_MS) {
      LayoutAnimation.configureNext({
        duration: 110,
        create: { type: "easeInEaseOut", property: "opacity" },
        update: { type: "easeInEaseOut" },
      });
      setSearchState(slotIndex, {
        trackLimitError: { durationMs: track.data.duration_ms },
      });
      return;
    }

    const incomingId = pickedId(track);
    const duplicateSlot = drafts.findIndex(
      (draft, i) =>
        i !== slotIndex &&
        draft.track !== null &&
        pickedId(draft.track) === incomingId,
    );
    if (duplicateSlot !== -1) {
      Alert.alert(
        "Track already selected",
        `This track is already selected for the other submission.`,
      );
      return;
    }

    // Commit the track, close this editor, and progressively open the
    // immediately-next empty slot as the new editor.
    setDrafts((prev) => {
      const next = prev.map((draft, i) =>
        i === slotIndex
          ? {
              ...draft,
              track,
              searchInput: "",
              searchResults: [],
              isSearching: false,
              isEditingTrack: false,
            }
          : draft,
      );
      const nextIdx = slotIndex + 1;
      if (
        nextIdx < next.length &&
        !next[nextIdx].track &&
        !next[nextIdx].isEditingTrack
      ) {
        next[nextIdx] = { ...next[nextIdx], isEditingTrack: true };
      }
      return next;
    });
  };

  // EDIT button on a filled slot reuses this: clears the track AND flips
  // the slot back into editor mode so the user can search again. For the
  // "+ ADD PICK NN" peek, the track is already null so this just opens
  // the editor.
  const openTrackEditor = (slotIndex: number) => {
    setSearchState(slotIndex, {
      track: null,
      isEditingTrack: true,
      searchInput: "",
      searchResults: [],
      isSearching: false,
      trackLimitError: null,
    });
  };

  const allTracksSelected = drafts.every((draft) => Boolean(draft.track));
  const hasUnsavedChanges = drafts.some((draft, index) => {
    const baseline = baselineDrafts[index];
    return (
      JSON.stringify(comparableDraft(draft)) !==
      JSON.stringify(comparableDraft(baseline))
    );
  });
  const canSubmit = allTracksSelected && hasUnsavedChanges && !submitting;

  const submitDrafts = async () => {
    const unfilledSlot = drafts.findIndex((draft) => !draft.track);
    if (unfilledSlot !== -1) {
      Alert.alert(
        "Missing track",
        `Select a track for slot ${unfilledSlot + 1} before submitting.`,
      );
      return;
    }

    const payload: SubmissionDraft[] = drafts
      .filter((d): d is DraftSubmission & { track: PickedTrack } => !!d.track)
      .map((d) => {
        if (d.track.source === "spotify") {
          const t = d.track.data;
          return {
            submissionId: d.submissionId,
            track: {
              source: "spotify" as const,
              spotifyTrackId: t.id,
              title: t.name,
              artist: t.artists.map((a) => a.name).join(", "),
              artworkUrl: t.album.images[0]?.url ?? null,
              isrc: t.external_ids?.isrc ?? null,
              albumName: t.album.name || null,
              durationMs: t.duration_ms || null,
              popularity: t.popularity || null,
            },
            comment: d.comment,
          };
        }
        const t = d.track.data;
        return {
          submissionId: d.submissionId,
          track: {
            source: "soundcloud" as const,
            soundcloudTrackUrl: t.url,
            title: t.title,
            artist: t.artist,
            artworkUrl: t.artworkUrl,
          },
          comment: d.comment,
        };
      });

    try {
      await submitMutation.mutateAsync({
        roundId: round.id,
        userId,
        drafts: payload,
      });
      onSubmitted();
    } catch (err) {
      const message = err instanceof MixError ? err.message : "Unknown error";
      Alert.alert("Submission failed", message);
    }
  };

  // Progressive disclosure: render every filled slot + every slot currently
  // in editor mode, then surface ONE collapsed "+ ADD PICK NN" peek for the
  // next slot if there's one beyond the visible set. Slots further out stay
  // hidden until the user advances.
  const lastVisibleIdx = drafts.reduce(
    (acc, draft, i) =>
      draft.track || draft.isEditingTrack ? i : acc,
    -1,
  );
  const peekIdx =
    lastVisibleIdx + 1 < drafts.length &&
    !drafts[lastVisibleIdx + 1]?.track
      ? lastVisibleIdx + 1
      : null;

  return (
    <View style={styles.submitBody}>
      {drafts.map((draft, index) => {
        const pickNum = String(index + 1).padStart(2, "0");
        const pickLabel = `PICK ${pickNum}`;
        const isVisible = Boolean(draft.track) || draft.isEditingTrack;
        const isPeek = index === peekIdx;
        if (!isVisible && !isPeek) return null;

        // Peek is no longer rendered as its own card — it's now an inline
        // dark pill at the bottom of the active editor card (see below).
        if (isPeek) return null;

        // Filled — track committed. Shows an EDIT chip that clears the
        // selection and flips the slot back into editor mode.
        if (draft.track && !draft.isEditingTrack) {
          return (
            <ChromeBorder
              key={`slot-${index + 1}`}
              radius={20}
              thickness={1.5}
              innerBg={THEME.surface}
            >
              <View style={styles.pickCardInner}>
                <View style={styles.pickHeaderRow}>
                  <View style={styles.pickEyebrowRow}>
                    <Text style={styles.pickEyebrow}>{pickLabel}</Text>
                    <Text style={styles.pickEyebrowDot}> · </Text>
                    <ChromeText glyph="✦" size={10} />
                    <Text style={styles.pickEyebrowState}> SAVED</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => openTrackEditor(index)}
                    hitSlop={10}
                    style={styles.editChip}
                  >
                    <Text style={styles.editChipText}>EDIT</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.pickTrackRow}>
                  {pickedArtwork(draft.track) ? (
                    <Image
                      source={{ uri: pickedArtwork(draft.track) as string }}
                      style={styles.pickArt}
                    />
                  ) : (
                    <View style={[styles.pickArt, styles.pickArtPlaceholder]} />
                  )}
                  <View style={styles.pickMeta}>
                    <Text style={styles.pickTitle} numberOfLines={1}>
                      {pickedTitle(draft.track)}
                    </Text>
                    <Text style={styles.pickArtist} numberOfLines={1}>
                      {pickedArtist(draft.track)}
                    </Text>
                  </View>
                </View>

                <TextInput
                  style={styles.pickCommentInput}
                  value={draft.comment}
                  onChangeText={(comment) => updateComment(index, comment)}
                  placeholder="Add a note (optional)…"
                  placeholderTextColor={THEME.faint}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            </ChromeBorder>
          );
        }

        // Editor — empty + isEditingTrack. No close/cancel button; the user
        // either selects a track (auto-advances) or hits EDIT on an earlier
        // filled slot to reroute.
        return (
          <ChromeBorder
            key={`slot-${index + 1}`}
            radius={20}
            thickness={1.5}
            innerBg={THEME.surface}
          >
            <View style={styles.pickCardInner}>
              <View style={styles.pickHeaderRow}>
                <Text style={styles.pickEyebrow}>{pickLabel}</Text>
              </View>

              <ChromeBorder
                radius={12}
                thickness={1.5}
                innerBg="rgba(255,255,255,0.6)"
              >
                <View style={styles.searchInputRow}>
                  <Text style={styles.searchGlyph}>⌕</Text>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="search spotify or paste a spotify / soundcloud link"
                    placeholderTextColor={THEME.muted}
                    value={draft.searchInput}
                    onChangeText={(value) => updateSearchInput(index, value)}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </ChromeBorder>

              {draft.trackLimitError && (
                <TrackLimitBanner
                  durationMs={draft.trackLimitError.durationMs}
                  onDismiss={() => setSearchState(index, { trackLimitError: null })}
                />
              )}

              {draft.isSearching && (
                <ActivityIndicator
                  color={THEME.muted}
                  size="small"
                  style={{ marginTop: 6 }}
                />
              )}

              {draft.searchResults.map((track) => (
                <TouchableOpacity
                  key={`${index}-${pickedId(track)}`}
                  style={styles.searchResultRow}
                  onPress={() => selectTrack(index, track)}
                >
                  {pickedArtwork(track) ? (
                    <ChromeBorder radius={8} thickness={1} clip style={styles.searchResultArt}>
                      <Image
                        source={{ uri: pickedArtwork(track) as string }}
                        style={{ width: "100%", height: "100%" }}
                      />
                    </ChromeBorder>
                  ) : (
                    <View
                      style={[
                        styles.searchResultArt,
                        styles.searchResultArtPlaceholder,
                      ]}
                    />
                  )}
                  <View style={styles.searchResultMeta}>
                    <Text style={styles.searchResultTitle} numberOfLines={1}>
                      {pickedTitle(track)}
                    </Text>
                    <Text style={styles.searchResultArtist} numberOfLines={1}>
                      {pickedArtist(track)}
                    </Text>
                  </View>
                  <ChromeBorder
                    radius={18}
                    thickness={1.5}
                    innerBg="#fff"
                    clip
                    style={styles.addBubble}
                  >
                    <View style={styles.addBubbleCenter}>
                      <Text style={styles.addBubbleGlyph}>+</Text>
                    </View>
                  </ChromeBorder>
                </TouchableOpacity>
              ))}

              {/* Embedded peek for the next slot — dark pill at the bottom
                  of the editor card. Tap = open that slot as a new editor. */}
              {peekIdx !== null ? (
                <TouchableOpacity
                  style={styles.addPickInline}
                  onPress={() => openTrackEditor(peekIdx)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.addPickInlineText}>
                    + ADD PICK {String(peekIdx + 1).padStart(2, "0")}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </ChromeBorder>
        );
      })}

      <ThemedButton
        label={mySubmissions.length > 0 ? "Save Changes" : "Submit Picks"}
        onPress={submitDrafts}
        disabled={!canSubmit}
        loading={submitting}
      />
    </View>
  );
}

// ─── Voting screen (Bubblegum hero + playlist) ────────────────────────────────
// Top ~55% is a custom hero (image + muted-loop video) that fades into the
// iridescent wash below. Title, meta pill, and PLAY / ADD TO SPOTIFY buttons
// live BELOW the image on the wash. Bottom half is the playlist with vote
// arrows and an inline-accordion comment input.

// Fixed hero artwork for the voting screen — matches the home active card's
// asset so the iOS .zoom transition stays seamless.
const VOTING_HERO_IMAGE_KEY = "disco-balloon-hero";

// Tuning constants ported from the original ui-preview Motion Artwork POC.
// Once videos are re-authored to a centered focal zone these can both be 0.
const HERO_VIDEO_OFFSET_X = 13;
const HERO_VIDEO_OFFSET_Y = 25;

function VoteHeroVideoLayer({ source }: { source: number }) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={{
        width: "93%",
        height: "93%",
        transform: [
          { translateX: HERO_VIDEO_OFFSET_X },
          { translateY: HERO_VIDEO_OFFSET_Y },
        ],
      }}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

function VoteHero({ imageKey, heroHeight }: { imageKey: string; heroHeight: number }) {
  const image = imageForKey(imageKey);
  const video = videoForKey(imageKey);
  const tone = toneForKey(imageKey);

  return (
    <MaskedView
      style={{ height: heroHeight }}
      maskElement={
        <LinearGradient
          colors={["#000", "#000", "transparent"]}
          locations={[0, 0.6, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      }
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tone }]}>
        {image != null ? (
          <>
            <View style={StyleSheet.absoluteFillObject}>
              <ExpoImage
                source={image}
                style={{ width: "100%", height: "100%" }}
                blurRadius={40}
                contentFit="cover"
                contentPosition="top"
                transition={0}
              />
            </View>
            <View style={StyleSheet.absoluteFillObject}>
              <ExpoImage
                source={image}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                contentPosition="top"
                transition={0}
              />
            </View>
          </>
        ) : null}
        {video != null ? (
          <View style={StyleSheet.absoluteFillObject}>
            <VoteHeroVideoLayer source={video} />
          </View>
        ) : null}
      </View>
    </MaskedView>
  );
}

function VotingScreenContent({
  round,
  userId,
  submissions,
  myVotes,
  didSubmit,
  isSpectator,
  isCommissioner,
  countdown,
  leagueName,
  onVoted,
  onBack,
  onForceEnd,
}: {
  round: Round;
  userId: string;
  submissions: Submission[];
  myVotes: Record<string, number>;
  didSubmit: boolean;
  isSpectator: boolean;
  isCommissioner: boolean;
  countdown: string;
  leagueName?: string;
  onVoted: () => void;
  onBack: () => void;
  onForceEnd: () => void;
}) {
  const pointsTotal = round.seasons?.default_points_per_round ?? 10;
  const maxPerTrack = round.seasons?.default_max_points_per_track ?? 5;

  // Allocation seeds from myVotes on first render — but useMyVotes loads
  // async, so the initial value is usually `{}`. Sync whenever myVotes
  // changes (e.g. data lands after mount, or refetch on focus brings new
  // server state). The "useState initializer runs once" rule was masking
  // the loaded data and making the post-submit view show 0 pts everywhere.
  const [allocation, setAllocation] = useState<Record<string, number>>(
    () => myVotes,
  );
  const myVotesKey = JSON.stringify(myVotes);
  useEffect(() => {
    setAllocation(myVotes);
    // myVotesKey gives us a stable signal that the contents (not just the
    // object identity) actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myVotesKey]);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>(
    {},
  );
  // Per-submission state for the comment draft.
  //   savedCommentIds — slot has a stowed comment (icon goes solid). Stays
  //     set while the user is editing so the indicator doesn't flicker.
  //   editingCommentIds — slot was previously saved and is currently being
  //     re-opened for edit. Lets us tell "drafting a new one" from "modifying
  //     a saved one"; in editing mode, Save is enabled even when the input
  //     is empty (so clearing → Save acts as a delete).
  // The actual write to the DB happens on Submit Votes alongside the vote
  // payload; this state is purely UI.
  const [savedCommentIds, setSavedCommentIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [editingCommentIds, setEditingCommentIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedCommentId, setExpandedCommentId] = useState<string | null>(
    null,
  );
  const [justSubmitted, setJustSubmitted] = useState(false);
  const submitMutation = useSubmitVotes();
  const submitting = submitMutation.isPending;
  const playback = usePlayback();

  const used = Object.values(allocation).reduce((a, b) => a + b, 0);
  const remaining = pointsTotal - used;
  const alreadyVoted = Object.keys(myVotes).length > 0;
  const showSubmittedView = alreadyVoted || justSubmitted;
  const canEdit = didSubmit && !isSpectator && !showSubmittedView;

  // Build the orderable playlist (skip own track from playable queue is OK —
  // user can still hear it via the round's own playback context).
  const orderedPlaylist: PlaylistTrack[] = useMemo(
    () =>
      submissions
        .map(submissionToPlaylistTrack)
        .filter((t): t is PlaylistTrack => t !== null),
    [submissions],
  );

  const onPlay = () => {
    if (orderedPlaylist.length === 0) return;
    playback.playPlaylist(orderedPlaylist, 0);
  };

  // Tap a vote row to start playing that track. Submissions without a Spotify
  // ID aren't in orderedPlaylist (filtered above) and become non-interactive.
  const onPlaySubmission = (subId: string) => {
    const idx = orderedPlaylist.findIndex((t) => t.id === subId);
    if (idx === -1) return;
    playback.playPlaylist(orderedPlaylist, idx);
  };

  // Which submission is currently playing (regardless of where playback was
  // started from) — used to flag the active row.
  const currentPlayingSubId =
    playback.currentIndex !== null
      ? playback.playlist[playback.currentIndex]?.id ?? null
      : null;

  // TODO(spotify): wire to real "save playlist to Spotify" once the backend
  // hook exists. Stubbed so the button reads as functional today.
  const onAddToSpotify = () => {
    Alert.alert("Add to Spotify", "Coming soon — this will save the round playlist to your Spotify account.");
  };

  const adjust = (subId: string, delta: number) => {
    if (!canEdit) return;
    setAllocation((prev) => {
      const current = prev[subId] ?? 0;
      const next = Math.max(0, Math.min(maxPerTrack, current + delta));
      const newUsed = used - current + next;
      if (newUsed > pointsTotal) return prev;
      return { ...prev, [subId]: next };
    });
  };

  const toggleComment = (subId: string) => {
    // Uniform ease + matching duration across all three slots. Spring on
    // `update` produced a timing mismatch — the rows below would snap up
    // before the accordion finished fading, so the Save/Edit pill appeared
    // to "linger" on top of the next track for a frame.
    LayoutAnimation.configureNext({
      duration: 180,
      create: { type: "easeInEaseOut", property: "opacity" },
      update: { type: "easeInEaseOut" },
      delete: { type: "easeInEaseOut", property: "opacity" },
    });
    setExpandedCommentId((curr) => (curr === subId ? null : subId));
  };

  const submitVotes = async () => {
    if (remaining > 0) {
      Alert.alert(
        "Points not fully spent",
        `You have ${remaining} point${remaining !== 1 ? "s" : ""} left to allocate.`,
      );
      return;
    }
    const votes: VoteInput[] = Object.entries(allocation)
      .filter(([, pts]) => pts > 0)
      .map(([submissionId, points]) => ({ submissionId, points }));
    const comments: VoteCommentInput[] = submissions
      .filter((s) => (commentInputs[s.id] ?? "").trim().length > 0)
      .map((s) => ({ submissionId: s.id, body: commentInputs[s.id] }));

    try {
      await submitMutation.mutateAsync({
        roundId: round.id,
        userId,
        votes,
        comments,
      });
      LayoutAnimation.configureNext({
        duration: 450,
        create: { type: "easeInEaseOut", property: "opacity" },
        update: { type: "easeInEaseOut", springDamping: 0.85 },
        delete: { type: "easeInEaseOut", property: "opacity" },
      });
      setJustSubmitted(true);
      onVoted();
    } catch (err) {
      const message = err instanceof MixError ? err.message : "Unknown error";
      Alert.alert("Submit failed", message);
    }
  };

  void onBack;
  void leagueName;

  // Pill (dark) shows round + season; the trailing text (same dark plum
  // ink) shows picks + closes time. Reference: voting page mockup, Nov 2026.
  const pillLabel = [
    `R${String(round.round_number).padStart(2, "0")}`,
    round.seasons?.name ? round.seasons.name.toUpperCase() : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const metaTail = (() => {
    const m = countdown.match(/ in (.+)$/);
    const dur = m ? m[1] : countdown;
    return `${submissions.length} PICKS · CLOSES ${dur.toUpperCase()}`;
  })();

  const { height: screenHeight } = useWindowDimensions();
  const heroHeight = screenHeight * 0.55;

  return (
    <View style={{ flex: 1 }}>
      {/* Hero container — image/video fills the box; title + meta overlay
          sits absolutely at the bottom of the hero, painted over the faded
          portion of the image. Buttons & playlist sit *below* the hero
          rectangle in normal flow. */}
      <View>
        <VoteHero imageKey={VOTING_HERO_IMAGE_KEY} heroHeight={heroHeight} />

        <View style={styles.voteTitleOverlay} pointerEvents="none">
          <View style={styles.voteTitleRow}>
            <Text style={styles.voteTitleOnHero} numberOfLines={3}>
              {round.prompt}
            </Text>
            <ChromeText glyph="★" size={22} style={styles.voteTitleStar} />
          </View>
          <View style={styles.voteMetaRow}>
            {pillLabel ? (
              <View style={styles.voteMetaPill}>
                <Text style={styles.voteMetaPillText} numberOfLines={1}>
                  {pillLabel}
                </Text>
              </View>
            ) : null}
            <Text style={styles.voteMetaTail} numberOfLines={1}>
              {pillLabel ? " · " : ""}
              {metaTail}
            </Text>
          </View>
        </View>
      </View>

      {/* PLAY + ADD TO SPOTIFY buttons sit on the wash, below the image.
          Both rendered as plain Pressables so the row stays the same shape
          on each side (the previous ChromeBorder-wrapped Play button was
          producing visible chrome bands because the inner Pressable didn't
          fill the gradient's content box). */}
      <View style={styles.voteButtonsRow}>
        <ChromeButton onPress={onPlay} style={{ flex: 1 }}>
          <View style={styles.votePlayTriangle} />
          <Text style={styles.voteBtnLabelDark}>Play</Text>
        </ChromeButton>
        <Pressable
          style={[styles.voteBtnInner, styles.voteBtnDarkBg]}
          onPress={onAddToSpotify}
        >
          <Text style={styles.voteBtnGlyphLight}>+</Text>
          <Text style={styles.voteBtnLabelLight}>Add to Spotify</Text>
        </Pressable>
      </View>

      <View style={styles.votePlaylist}>
        {!didSubmit && !isSpectator ? (
          <View style={styles.voteBanner}>
            <Text style={styles.voteBannerTitle}>Not eligible this round</Text>
            <Text style={styles.voteBannerBody}>
              You didn&apos;t submit a track before the deadline. You can see
              the picks but can&apos;t vote.
            </Text>
          </View>
        ) : null}
        {isSpectator ? (
          <View style={styles.voteBanner}>
            <Text style={styles.voteBannerTitle}>You&apos;re spectating</Text>
            <Text style={styles.voteBannerBody}>
              Participants are voting. Results will show when voting closes.
            </Text>
          </View>
        ) : null}
        {showSubmittedView ? (
          <View style={styles.voteBanner}>
            <Text style={styles.voteBannerTitle}>✓ Your favorites</Text>
            <Text style={styles.voteBannerBody}>
              Votes locked in. Results show when voting closes.
            </Text>
          </View>
        ) : canEdit ? (
          <View style={styles.votePointsBar}>
            <Text
              style={[
                styles.votePointsRemaining,
                remaining === 0 && { color: THEME.ink },
              ]}
            >
              {remaining}
            </Text>
            <Text style={styles.votePointsHint}>
              {" "}
              / {pointsTotal} pts remaining · max {maxPerTrack} per track
            </Text>
          </View>
        ) : null}

        {submissions.map((sub, idx) => {
          const trackNum = String(idx + 1).padStart(2, "0");
          const pts = allocation[sub.id] ?? 0;
          const isOwn = sub.user_id === userId;
          const plusDisabled =
            submitting ||
            !canEdit ||
            remaining === 0 ||
            pts >= maxPerTrack ||
            isOwn;
          const minusDisabled =
            submitting || !canEdit || pts === 0 || isOwn;
          const isCommentOpen = expandedCommentId === sub.id;
          const showVoteUI = canEdit && !isOwn;
          const isCurrentTrack = currentPlayingSubId === sub.id;
          const isPlayable = !!sub.spotify_track_id || !!sub.soundcloud_track_url;

          return (
            <View key={sub.id}>
              <View style={styles.voteRow}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => onPlaySubmission(sub.id)}
                  disabled={!isPlayable}
                  style={styles.voteRowTapArea}
                >
                  <Text
                    style={[
                      styles.voteRowNum,
                      isCurrentTrack && styles.voteRowNumActive,
                    ]}
                  >
                    {isCurrentTrack ? "▶" : trackNum}
                  </Text>
                  {sub.track_artwork_url ? (
                    <ChromeBorder
                      radius={8}
                      thickness={1}
                      clip
                      style={styles.voteRowArt}
                    >
                      <Image
                        source={{ uri: sub.track_artwork_url }}
                        style={{ width: "100%", height: "100%" }}
                      />
                    </ChromeBorder>
                  ) : (
                    <View
                      style={[styles.voteRowArt, styles.voteRowArtPlaceholder]}
                    />
                  )}
                  <View style={styles.voteRowMeta}>
                    <Text style={styles.voteRowTitle} numberOfLines={1}>
                      {sub.track_title}
                    </Text>
                    <Text style={styles.voteRowArtist} numberOfLines={1}>
                      {sub.track_artist}
                    </Text>
                  </View>
                  {/* Own-track label sits inside the tap area — it's a passive
                      label, not a control, so including it keeps the whole row
                      tappable when there's nothing interactive on the right. */}
                  {isOwn ? (
                    <Text style={styles.voteOwnLabel}>YOUR{"\n"}TRACK</Text>
                  ) : null}
                </TouchableOpacity>

                {showVoteUI ? (
                  <View style={styles.voteStack}>
                    <TouchableOpacity
                      style={[
                        styles.voteArrow,
                        plusDisabled && styles.voteArrowDisabled,
                      ]}
                      onPress={() => adjust(sub.id, 1)}
                      disabled={plusDisabled}
                      hitSlop={6}
                    >
                      <ChevronUp
                        size={20}
                        strokeWidth={2.5}
                        color={
                          plusDisabled ? "rgba(26,8,20,0.25)" : THEME.ink
                        }
                      />
                    </TouchableOpacity>
                    <Text style={styles.voteCount}>{pts}</Text>
                    <TouchableOpacity
                      style={[
                        styles.voteArrow,
                        minusDisabled && styles.voteArrowDisabled,
                      ]}
                      onPress={() => adjust(sub.id, -1)}
                      disabled={minusDisabled}
                      hitSlop={6}
                    >
                      <ChevronDown
                        size={20}
                        strokeWidth={2.5}
                        color={
                          minusDisabled ? "rgba(26,8,20,0.25)" : THEME.ink
                        }
                      />
                    </TouchableOpacity>
                  </View>
                ) : !isOwn && showSubmittedView ? (
                  <View style={styles.voteStack}>
                    <Text style={styles.voteCount}>{pts}</Text>
                    <Text style={styles.voteLocked}>pts</Text>
                  </View>
                ) : null}

                {canEdit && !isOwn ? (
                  <TouchableOpacity
                    style={styles.commentIconBtn}
                    onPress={() => toggleComment(sub.id)}
                    hitSlop={6}
                  >
                    {/* Outline while drafting (or empty); flips to the
                        filled-with-dot indicator only after Save commits the
                        draft. That commit-on-click swap is the visual
                        receipt for the user — Save closes the accordion and
                        the icon goes solid in the same moment. */}
                    {savedCommentIds.has(sub.id) ? (
                      <MessageCircleMore
                        size={20}
                        color={THEME.ink}
                        fill={THEME.ink}
                        strokeWidth={2}
                      />
                    ) : (
                      <MessageCircle
                        size={20}
                        color={THEME.ink}
                        strokeWidth={2}
                        opacity={isCommentOpen ? 1 : 0.55}
                      />
                    )}
                  </TouchableOpacity>
                ) : showSubmittedView &&
                  !isOwn &&
                  savedCommentIds.has(sub.id) ? (
                  // Post-submit: passive indicator that the user left a
                  // comment on this track. Slightly smaller + faded so it
                  // reads as a subtle marker, not a control.
                  <View style={styles.commentIndicator} pointerEvents="none">
                    <MessageCircleMore
                      size={16}
                      color={THEME.ink}
                      fill={THEME.ink}
                      strokeWidth={2}
                      opacity={0.55}
                    />
                  </View>
                ) : null}
              </View>

              {/* Inline accordion: comment input slides in between this row
                  and the next one. The Save/Edit button floats inside the
                  textbox on the right; the input pads its right side so the
                  text never runs under the button. */}
              {canEdit && isCommentOpen ? (() => {
                const isSaved = savedCommentIds.has(sub.id);
                const isEditing = editingCommentIds.has(sub.id);
                // Editable while drafting fresh OR while explicitly editing
                // a previously-saved comment.
                const editable = !isSaved || isEditing;
                const hasDraft =
                  (commentInputs[sub.id] ?? "").trim().length > 0;
                // Save needs text when drafting; in editing mode Save is
                // allowed even with empty text (acts as a delete).
                const saveDisabled = !isEditing && !hasDraft;
                return (
                  <View style={styles.commentAccordion}>
                    <TextInput
                      style={[
                        styles.commentAccordionInput,
                        !editable && styles.commentAccordionInputSaved,
                      ]}
                      value={commentInputs[sub.id] ?? ""}
                      onChangeText={(v) =>
                        setCommentInputs((prev) => ({ ...prev, [sub.id]: v }))
                      }
                      placeholder="Leave a comment for this track…"
                      placeholderTextColor={THEME.faint}
                      multiline
                      textAlignVertical="top"
                      autoFocus={editable}
                      editable={editable}
                    />
                    <View
                      style={styles.commentInlineBtnSlot}
                      pointerEvents="box-none"
                    >
                      {editable ? (
                        <Pressable
                          style={[
                            styles.commentInlineBtn,
                            styles.commentPrimaryBtn,
                            saveDisabled && styles.commentPrimaryBtnDisabled,
                          ]}
                          onPress={() => {
                            if (saveDisabled) return;
                            const text = (commentInputs[sub.id] ?? "").trim();
                            setSavedCommentIds((prev) => {
                              const next = new Set(prev);
                              if (text.length > 0) next.add(sub.id);
                              else next.delete(sub.id); // empty save = delete
                              return next;
                            });
                            setEditingCommentIds((prev) => {
                              if (!prev.has(sub.id)) return prev;
                              const next = new Set(prev);
                              next.delete(sub.id);
                              return next;
                            });
                            if (text.length === 0) {
                              setCommentInputs((prev) => ({
                                ...prev,
                                [sub.id]: "",
                              }));
                            }
                            LayoutAnimation.configureNext({
                              duration: 180,
                              create: {
                                type: "easeInEaseOut",
                                property: "opacity",
                              },
                              update: { type: "easeInEaseOut" },
                              delete: {
                                type: "easeInEaseOut",
                                property: "opacity",
                              },
                            });
                            setExpandedCommentId(null);
                          }}
                          disabled={saveDisabled}
                          hitSlop={6}
                        >
                          <Text style={styles.commentPrimaryBtnText}>
                            Save
                          </Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          style={[
                            styles.commentInlineBtn,
                            styles.commentSecondaryBtn,
                          ]}
                          onPress={() => {
                            // Enter editing mode while keeping the saved flag
                            // intact, so the row indicator stays solid until
                            // the user commits an empty-Save (= delete).
                            setEditingCommentIds((prev) => {
                              const next = new Set(prev);
                              next.add(sub.id);
                              return next;
                            });
                          }}
                          hitSlop={6}
                        >
                          <Text style={styles.commentSecondaryBtnText}>
                            Edit
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })() : null}

              {/* Subtle hairline so adjacent tracks don't read as one blob.
                  Skipped after the last row — no trailing divider before
                  the Submit Votes button. */}
              {idx < submissions.length - 1 ? (
                <View style={styles.trackDivider} />
              ) : null}
            </View>
          );
        })}

        {canEdit ? (
          <ThemedButton
            label="Submit Votes"
            onPress={submitVotes}
            disabled={submitting || remaining > 0}
            loading={submitting}
          />
        ) : null}

        {/* Commissioner-only force-end. Sits below the Submit Votes button so
            the destructive action is the last thing in tab order, never above
            the primary vote-submit CTA. */}
        {isCommissioner ? (
          <View style={styles.forceEndWrap}>
            <ThemedButton
              label="Force end voting"
              onPress={onForceEnd}
              variant="danger"
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ─── Submissions header (Bubblegum hero block) ───────────────────────────────
// "this sounds like" eyebrow + big italic round.prompt + chrome ★ + closes
// pill. A low-intensity BlurView sits behind the title, giving the type a
// soft halo against the hot-pink halftone.

function SubmissionsHero({
  round,
  countdown,
}: {
  round: Round;
  countdown: string;
}) {
  return (
    <View style={styles.heroBlock}>
      <Text style={styles.heroTagline}>this sounds like</Text>

      <HaloText style={styles.heroTitleWrap}>
        <FittedChromeTitle
          text={round.prompt.toUpperCase()}
          textStyle={styles.heroTitle}
          minimumFontScale={0.5}
          maxStarSize={44}
        />
      </HaloText>

      <View style={styles.closesPill}>
        <ChromeText glyph="●" size={9} style={{ marginRight: 6 }} />
        <Text style={styles.closesPillText}>
          {/* formatPhaseCountdown returns "Submissions close in 2d 4h" — we
              want just "CLOSES 2D 4H" for the pill. Split on " in " and use
              the duration; fall back to the full string if the verb shape
              changes. */}
          {(() => {
            const m = countdown.match(/ in (.+)$/);
            const dur = m ? m[1] : countdown;
            return `CLOSES ${dur.toUpperCase()}`;
          })()}
        </Text>
      </View>
    </View>
  );
}

// ─── Voting phase ─────────────────────────────────────────────────────────────
// TODO: redesign in v2 — vote stepper / submission card layout.

function VotingPhase({
  round,
  userId,
  submissions,
  myVotes,
  didSubmit,
  isSpectator,
  onVoted,
  onScrollToTop,
}: {
  round: Round;
  userId: string;
  submissions: Submission[];
  myVotes: Record<string, number>;
  didSubmit: boolean;
  isSpectator: boolean;
  onVoted: () => void;
  onScrollToTop?: () => void;
}) {
  const pointsTotal = round.seasons?.default_points_per_round ?? 10;
  const maxPerTrack = round.seasons?.default_max_points_per_track ?? 5;

  const [allocation, setAllocation] = useState<Record<string, number>>(() => myVotes);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [justSubmitted, setJustSubmitted] = useState(false);
  const submitMutation = useSubmitVotes();
  const submitting = submitMutation.isPending;

  const used = Object.values(allocation).reduce((a, b) => a + b, 0);
  const remaining = pointsTotal - used;
  const alreadyVoted = Object.keys(myVotes).length > 0;
  const showSubmittedView = alreadyVoted || justSubmitted;

  const sortedSubmissions = useMemo(() => {
    if (!showSubmittedView) return submissions;
    return [...submissions].sort((a, b) => {
      const aOwn = a.user_id === userId ? 1 : 0;
      const bOwn = b.user_id === userId ? 1 : 0;
      if (aOwn !== bOwn) return aOwn - bOwn;
      const aPts = allocation[a.id] ?? 0;
      const bPts = allocation[b.id] ?? 0;
      return bPts - aPts;
    });
  }, [submissions, allocation, showSubmittedView, userId]);

  const adjust = (subId: string, delta: number) => {
    setAllocation((prev) => {
      const current = prev[subId] ?? 0;
      const next = Math.max(0, Math.min(maxPerTrack, current + delta));
      const newUsed = used - current + next;
      if (newUsed > pointsTotal) return prev;
      return { ...prev, [subId]: next };
    });
  };

  const submitVotes = async () => {
    if (remaining > 0) {
      Alert.alert('Points not fully spent', `You have ${remaining} point${remaining !== 1 ? 's' : ''} left to allocate.`);
      return;
    }
    const votes: VoteInput[] = Object.entries(allocation)
      .filter(([, pts]) => pts > 0)
      .map(([submissionId, points]) => ({ submissionId, points }));
    const comments: VoteCommentInput[] = submissions
      .filter((s) => (commentInputs[s.id] ?? '').trim().length > 0)
      .map((s) => ({ submissionId: s.id, body: commentInputs[s.id] }));

    try {
      await submitMutation.mutateAsync({ roundId: round.id, userId, votes, comments });
      onScrollToTop?.();
      LayoutAnimation.configureNext({
        duration: 450,
        create: { type: 'easeInEaseOut', property: 'opacity' },
        update: { type: 'easeInEaseOut', springDamping: 0.85 },
        delete: { type: 'easeInEaseOut', property: 'opacity' },
      });
      setJustSubmitted(true);
      onVoted();
    } catch (err) {
      const message = err instanceof MixError ? err.message : 'Unknown error';
      Alert.alert('Submit failed', message);
    }
  };

  if (isSpectator) {
    return (
      <View style={styles.phaseCard}>
        <View style={styles.spectatorCard}>
          <Text style={styles.spectatorCardTitle}>You&apos;re spectating</Text>
          <Text style={styles.spectatorCardBody}>
            Sit back — participants are voting on their submissions. Results will show when voting closes.
          </Text>
        </View>
        {submissions.map((sub) => (
          <View key={sub.id} style={[styles.submissionVoteCard, { opacity: 0.5 }]}>
            <TrackRow title={sub.track_title} artist={sub.track_artist} artwork={sub.track_artwork_url} compact />
            {!!sub.comment && <Text style={styles.submissionComment}>&ldquo;{sub.comment}&rdquo;</Text>}
          </View>
        ))}
      </View>
    );
  }

  if (!didSubmit) {
    return (
      <View style={styles.phaseCard}>
        <View style={styles.ineligibleBanner}>
          <Text style={styles.ineligibleTitle}>Not eligible this round</Text>
          <Text style={styles.ineligibleSub}>
            You didn&apos;t submit a track before the deadline. You can see the submissions but can&apos;t vote.
          </Text>
        </View>
        {submissions.map((sub) => (
          <View key={sub.id} style={[styles.submissionVoteCard, { opacity: 0.5 }]}>
            <TrackRow title={sub.track_title} artist={sub.track_artist} artwork={sub.track_artwork_url} compact />
            {!!sub.comment && <Text style={styles.submissionComment}>&ldquo;{sub.comment}&rdquo;</Text>}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.phaseCard}>
      {showSubmittedView ? (
        <View style={styles.votedBanner}>
          <Text style={styles.votedBannerText}>✓ Your favorites</Text>
          <Text style={styles.votedBannerSub}>
            Votes locked in. Results show when voting closes.
          </Text>
        </View>
      ) : (
        <View style={styles.pointsBar}>
          <Text style={[styles.pointsRemaining, remaining === 0 && { color: THEME.accent }]}>
            {remaining}
          </Text>
          <Text style={styles.mutedHint}> / {pointsTotal} pts remaining · max {maxPerTrack} per track</Text>
        </View>
      )}

      {sortedSubmissions.map((sub) => {
        const isOwn = sub.user_id === userId;
        const pts = allocation[sub.id] ?? 0;
        const voted = pts > 0;
        const currentPts = pts;
        const minusDisabled = submitting || currentPts === 0;
        const plusDisabled =
          submitting || remaining === 0 || currentPts >= maxPerTrack;

        return (
          <View
            key={sub.id}
            style={[
              styles.submissionVoteCard,
              showSubmittedView && voted && styles.submissionVoteCardVoted,
              showSubmittedView && !voted && !isOwn && styles.submissionVoteCardUnvoted,
            ]}
          >
            <TrackRow title={sub.track_title} artist={sub.track_artist} artwork={sub.track_artwork_url} compact />
            {!!sub.comment && <Text style={styles.submissionComment}>&ldquo;{sub.comment}&rdquo;</Text>}

            {isOwn ? (
              <Text style={styles.ownTrackLabel}>YOUR TRACK</Text>
            ) : showSubmittedView ? (
              voted ? (
                <Text style={styles.lockedPts}>{pts} pt{pts !== 1 ? 's' : ''} given</Text>
              ) : (
                <Text style={styles.lockedPtsNone}>— no points</Text>
              )
            ) : (
              <View style={styles.voteStepper}>
                <TouchableOpacity
                  style={[styles.voteBtn, minusDisabled && styles.voteBtnDisabled]}
                  onPress={() => adjust(sub.id, -1)}
                  disabled={minusDisabled}
                >
                  <Text style={styles.voteBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.votePoints}>{currentPts}</Text>
                <TouchableOpacity
                  style={[styles.voteBtn, plusDisabled && styles.voteBtnDisabled]}
                  onPress={() => adjust(sub.id, 1)}
                  disabled={plusDisabled}
                >
                  <Text style={styles.voteBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            )}

            {!showSubmittedView && (
              <TextInput
                style={styles.commentInputField}
                value={commentInputs[sub.id] ?? ''}
                onChangeText={(v) => setCommentInputs((prev) => ({ ...prev, [sub.id]: v }))}
                placeholder="Leave a comment… (optional)"
                placeholderTextColor={THEME.faint}
                multiline
              />
            )}
          </View>
        );
      })}

      {!showSubmittedView && (
        <ThemedButton
          label="Submit Votes"
          onPress={submitVotes}
          disabled={submitting || remaining > 0}
          loading={submitting}
        />
      )}
    </View>
  );
}

// ─── Results phase ────────────────────────────────────────────────────────────

function ResultsPhase({
  round,
  submissions,
  leagueName,
  totalRounds,
  onBack,
}: {
  round: Round;
  submissions: Submission[];
  leagueName: string | undefined;
  totalRounds: number;
  onBack: () => void;
}) {
  const resultsQuery = useRoundResults(round.id);
  const votersQuery = useRoundVoters(round.id);
  const results = resultsQuery.data ?? [];
  const votersBySubmission = votersQuery.data ?? {};
  const loading = resultsQuery.isPending || votersQuery.isPending;
  const loadError =
    resultsQuery.error instanceof Error ? resultsQuery.error.message : null;

  const playback = usePlayback();
  const playlistRouter = useRouter();
  void totalRounds;

  const submissionCommentById = useMemo(() => {
    const map: Record<string, string | null> = {};
    submissions.forEach((s) => {
      map[s.id] = s.comment;
    });
    return map;
  }, [submissions]);

  const submissionById = useMemo(() => {
    const map: Record<string, Submission> = {};
    submissions.forEach((s) => {
      map[s.id] = s;
    });
    return map;
  }, [submissions]);

  const eligible = useMemo(
    () =>
      results
        .filter((r) => !r.is_void)
        .sort(
          (a, b) =>
            b.points_effective - a.points_effective ||
            b.points_raw - a.points_raw ||
            a.submission_id.localeCompare(b.submission_id),
        ),
    [results],
  );
  const forfeits = useMemo(
    () =>
      results
        .filter((r) => r.is_void)
        .sort(
          (a, b) =>
            b.points_raw - a.points_raw ||
            a.submission_id.localeCompare(b.submission_id),
        ),
    [results],
  );

  // Build the TrackList from the ranked submissions.
  const trackItems: TrackListItem[] = useMemo(
    () =>
      eligible.map((row, i) => ({
        id: row.submission_id,
        title: row.track_title,
        artist: row.track_artist,
        artworkUrl: row.track_artwork_url ?? undefined,
        submitterName: row.display_name,
        points: row.points_effective,
        rank: i + 1,
        comment: submissionCommentById[row.submission_id] ?? undefined,
      })),
    [eligible, submissionCommentById],
  );

  // Convert the ranked submissions into a playlist for the play/shuffle CTAs.
  const orderedPlaylist: PlaylistTrack[] = useMemo(
    () =>
      eligible
        .map((row) => submissionById[row.submission_id])
        .filter((s): s is Submission => !!s)
        .map(submissionToPlaylistTrack)
        .filter((t): t is PlaylistTrack => t !== null),
    [eligible, submissionById],
  );

  const onPlay = () => {
    if (orderedPlaylist.length === 0) return;
    playback.playPlaylist(orderedPlaylist, 0);
  };

  const onShuffle = () => {
    if (orderedPlaylist.length === 0) return;
    playback.playPlaylist(shuffled(orderedPlaylist), 0);
  };

  if (loading) {
    return <ActivityIndicator color={THEME.muted} style={{ marginTop: 24 }} />;
  }

  if (loadError) {
    return (
      <View style={{ gap: 10, paddingHorizontal: 24 }}>
        <Text style={styles.phaseLabel}>RESULTS</Text>
        <Text style={styles.mutedHint}>{loadError}</Text>
      </View>
    );
  }

  if (results.length === 0) {
    return (
      <View style={{ gap: 10, paddingHorizontal: 24 }}>
        <Text style={styles.phaseLabel}>RESULTS</Text>
        <Text style={styles.mutedHint}>No submissions recorded.</Text>
      </View>
    );
  }

  void leagueName;
  void onBack;
  void onShuffle;
  void trackItems;
  void submissionCommentById;

  // ─── Header metrics ────────────────────────────────────────────────────
  const totalPointsCast = eligible.reduce(
    (sum, r) => sum + r.points_effective,
    0,
  );
  const voterCount = (() => {
    const ids = new Set<string>();
    for (const subId of Object.keys(votersBySubmission)) {
      for (const v of votersBySubmission[subId] ?? []) {
        if (v.points > 0 || (v.comment ?? "").trim().length > 0) {
          ids.add(v.voter_user_id);
        }
      }
    }
    return ids.size;
  })();

  // ─── Helpers ───────────────────────────────────────────────────────────
  // Voter row visibility rule per spec:
  //   - Show if voter left a comment (even with 0 pts).
  //   - Show if voter gave points (even with no comment).
  //   - Hide if voter gave 0 pts AND no comment.
  const visibleVotersFor = (subId: string) =>
    (votersBySubmission[subId] ?? []).filter(
      (v) => v.points > 0 || (v.comment ?? "").trim().length > 0,
    );

  const top3 = eligible.slice(0, 3);
  const restEligible = eligible.slice(3);

  return (
    <View>
      {/* ── Header block: eyebrow, italic title + chrome ★, meta line,
            "Go to playlist" CTA. Sits directly on the wash. */}
      <View style={styles.resultsHeader}>
        <Text style={styles.resultsEyebrow}>round closed · results in</Text>
        {/* Split off the last word so it shares a flex group with the
            chrome ★ — that group is `flexWrap: nowrap`, so the star can
            never wrap to a line by itself. Everything before the last word
            wraps freely. */}
        {(() => {
          const upperPrompt = round.prompt.toUpperCase();
          const lastSpace = upperPrompt.lastIndexOf(" ");
          const head = lastSpace > 0 ? upperPrompt.slice(0, lastSpace) : "";
          const tail = lastSpace > 0 ? upperPrompt.slice(lastSpace + 1) : upperPrompt;
          return (
            <View style={styles.resultsTitleRow}>
              {head ? (
                <Text style={styles.resultsTitle}>{head + " "}</Text>
              ) : null}
              <View style={styles.resultsTitleTailGroup}>
                <Text style={styles.resultsTitle}>{tail}</Text>
                <ChromeText
                  glyph="★"
                  size={26}
                  style={styles.resultsTitleStar}
                />
              </View>
            </View>
          );
        })()}
        <Text style={styles.resultsMeta} numberOfLines={1}>
          ● {voterCount} VOTERS · {totalPointsCast} PTS CAST ·{" "}
          {submissions.length} TRACKS
        </Text>
        <Pressable
          style={styles.goPlaylistPill}
          onPress={() => {
            playlistRouter.push({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              pathname: "/(tabs)/(home)/playlist/[id]" as any,
              params: { id: round.id },
            });
          }}
        >
          <Text style={styles.goPlaylistPillText}>Go to Playlist</Text>
        </Pressable>
      </View>

      {/* ── Podium (top 3) ─────────────────────────────────────────────── */}
      {top3.length > 0 ? (
        <View style={styles.podiumRow}>
          <PodiumColumn rank={2} entry={top3[1]} topPoints={top3[0]?.points_effective ?? 1} />
          <PodiumColumn rank={1} entry={top3[0]} topPoints={top3[0]?.points_effective ?? 1} />
          <PodiumColumn rank={3} entry={top3[2]} topPoints={top3[0]?.points_effective ?? 1} />
        </View>
      ) : null}

      {/* ── Full results ───────────────────────────────────────────────── */}
      <View style={styles.fullResultsHead}>
        <Text style={styles.fullResultsLabel}>FULL RESULTS</Text>
        <View style={styles.fullResultsRule} />
        <Text style={styles.fullResultsLabel}>BY POINTS ↓</Text>
      </View>

      <View style={styles.resultsList}>
        {eligible.map((row, i) => (
          <ResultCard
            key={row.submission_id}
            row={row}
            voters={visibleVotersFor(row.submission_id)}
            place={i + 1}
          />
        ))}
        {forfeits.map((row) => (
          <ResultCard
            key={row.submission_id}
            row={row}
            voters={visibleVotersFor(row.submission_id)}
            forfeit
          />
        ))}
      </View>

      {/* Silence "rest never used" — the rest pattern keeps top3 + tail
          distinct in case we want to render them differently later. */}
      {void restEligible}
    </View>
  );
}

// ─── Podium column ────────────────────────────────────────────────────────────

type ResultRow = {
  submission_id: string;
  track_title: string;
  track_artist: string;
  track_artwork_url: string | null;
  display_name: string;
  points_effective: number;
  points_raw: number;
  is_void: boolean;
};

type VoterRow = {
  voter_user_id: string;
  voter_name: string;
  points: number;
  comment: string | null;
};

// Metal palettes — same shape as ChromeBorder's default; passed in to draw
// gold and bronze variants with the same polished-metal feel. Stops ramp
// light → mid → light → dark → light → mid so the gradient reads as
// hammered metal at any size.
const CHROME_STOPS = [
  "#f5f5f5",
  "#d0d0d0",
  "#ffffff",
  "#b0b0b0",
  "#e8e8e8",
  "#c8c8c8",
] as const;
// Lighter champagne-gold variant — every stop pulled up a step so the dark
// banding doesn't drag the average tone into a muddy mustard.
const GOLD_STOPS = [
  "#FFF0B0",
  "#E5BE54",
  "#FFF7CC",
  "#D6A742",
  "#F5D27E",
  "#E5BE54",
] as const;
// Lighter rose-bronze / copper variant. Same logic — the deep brown stops
// were eating the highlight; replaced with warmer mid-coppers.
const BRONZE_STOPS = [
  "#F2CBA1",
  "#C58A60",
  "#F9DCBC",
  "#B07847",
  "#DBA478",
  "#C58A60",
] as const;
const PODIUM_STOPS: Record<1 | 2 | 3, readonly string[]> = {
  1: GOLD_STOPS,
  2: CHROME_STOPS,
  3: BRONZE_STOPS,
};

// Per-rank sizing tuned to match Claude Design's podium reference: 1st's art
// is noticeably bigger; the metal platforms have clear height tiers so the
// "1 / 2 / 3" hierarchy reads at a glance.
const PODIUM_ART_SIZE: Record<1 | 2 | 3, number> = { 1: 110, 2: 86, 3: 86 };
const PODIUM_BAR_HEIGHT: Record<1 | 2 | 3, number> = { 1: 92, 2: 70, 3: 56 };
const RANK_ORDINAL: Record<1 | 2 | 3, string> = {
  1: "1ST",
  2: "2ND",
  3: "3RD",
};

function PodiumColumn({
  rank,
  entry,
  topPoints,
}: {
  rank: 1 | 2 | 3;
  entry: ResultRow | undefined;
  topPoints: number;
}) {
  // Keep the slot reserved (matching the other columns' alignment) even
  // when fewer than 3 results exist.
  void topPoints;
  if (!entry) {
    return <View style={styles.podiumCol} />;
  }
  const stops = PODIUM_STOPS[rank];
  const artSize = PODIUM_ART_SIZE[rank];
  const barHeight = PODIUM_BAR_HEIGHT[rank];

  return (
    <View style={styles.podiumCol}>
      {/* Art tile with corner badge */}
      <View style={[styles.podiumArtWrap, { width: artSize, height: artSize }]}>
        <ChromeBorder
          radius={10}
          thickness={2.5}
          clip
          colors={stops}
          style={{ width: artSize, height: artSize }}
        >
          {entry.track_artwork_url ? (
            <Image
              source={{ uri: entry.track_artwork_url }}
              style={styles.podiumArtImg}
            />
          ) : (
            <View style={[styles.podiumArtImg, styles.podiumArtPlaceholder]} />
          )}
        </ChromeBorder>
        <View style={styles.podiumBadgeWrap} pointerEvents="none">
          <ChromeBorder
            radius={14}
            thickness={1.5}
            colors={stops}
            innerBg="rgba(255,255,255,0.92)"
            clip
            style={styles.podiumBadge}
          >
            <View style={styles.podiumBadgeCenter}>
              <Text style={styles.podiumBadgeText}>{rank}</Text>
            </View>
          </ChromeBorder>
        </View>
      </View>

      {/* Track metadata sits BETWEEN the art and the metal bar — matches
          the design's ordering: art → title → artist → BY x → bar. */}
      <Text style={styles.podiumTitle} numberOfLines={1}>
        {entry.track_title}
      </Text>
      <Text style={styles.podiumArtist} numberOfLines={1}>
        {entry.track_artist}
      </Text>
      <Text style={styles.podiumSubmitter} numberOfLines={1}>
        BY {entry.display_name.toUpperCase()}
      </Text>

      {/* Metal platform — gold/chrome/bronze gradient tile that anchors each
          column. Height tier by rank gives the literal "podium" silhouette;
          +pts + ordinal sit inside. */}
      <LinearGradient
        colors={stops as unknown as [string, string, ...string[]]}
        locations={[0, 0.25, 0.45, 0.6, 0.8, 1]}
        // 135° (top-left → bottom-right). Same diagonal axis as the chrome
        // glyph + border so all the metal in the UI reads as one alloy
        // under a single light source.
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.podiumBar, { height: barHeight }]}
      >
        <Text style={styles.podiumBarPts}>
          +{entry.points_effective}
        </Text>
        <Text style={styles.podiumBarOrdinal}>{RANK_ORDINAL[rank]}</Text>
      </LinearGradient>
    </View>
  );
}

// ─── Result card (full results list) ──────────────────────────────────────────

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

function ResultCard({
  row,
  voters,
  place,
  forfeit,
}: {
  row: ResultRow;
  voters: VoterRow[];
  place?: number;
  forfeit?: boolean;
}) {
  const points = forfeit ? row.points_raw : row.points_effective;
  // Top-3 in eligible list still get a metal corner badge (1/2/3); 4th+ get
  // a regular numeric place chip; forfeits get no place marker.
  const isPodiumPlace = place === 1 || place === 2 || place === 3;
  return (
    <View
      style={[styles.resultCard, forfeit && styles.resultCardForfeit]}
    >
      <View style={styles.resultCardHeader}>
        <View style={styles.resultCardArtWrap}>
          {row.track_artwork_url ? (
            <ChromeBorder
              radius={10}
              thickness={1.5}
              clip
              colors={
                isPodiumPlace
                  ? (PODIUM_STOPS[place as 1 | 2 | 3] as readonly string[])
                  : undefined
              }
              style={styles.resultCardArt}
            >
              <Image
                source={{ uri: row.track_artwork_url }}
                style={{ width: "100%", height: "100%" }}
              />
            </ChromeBorder>
          ) : (
            <View style={[styles.resultCardArt, styles.resultCardArtPh]} />
          )}
          {/* Corner place badge — gold/chrome/bronze disc for top 3, simple
              numeric chip for 4th+. Forfeits show nothing. */}
          {!forfeit && place != null ? (
            isPodiumPlace ? (
              <View style={styles.resultBadgeWrap} pointerEvents="none">
                <ChromeBorder
                  radius={12}
                  thickness={1.5}
                  colors={PODIUM_STOPS[place as 1 | 2 | 3]}
                  innerBg="rgba(255,255,255,0.92)"
                  clip
                  style={styles.resultBadge}
                >
                  <View style={styles.podiumBadgeCenter}>
                    <Text style={styles.resultBadgeText}>{place}</Text>
                  </View>
                </ChromeBorder>
              </View>
            ) : (
              <View style={styles.resultBadgePlainWrap} pointerEvents="none">
                <Text style={styles.resultBadgePlainText}>{place}</Text>
              </View>
            )
          ) : null}
        </View>
        <View style={styles.resultCardMeta}>
          <Text style={styles.resultCardTitle} numberOfLines={1}>
            {row.track_title}
          </Text>
          <Text style={styles.resultCardArtist} numberOfLines={1}>
            {row.track_artist}
          </Text>
          <Text style={styles.resultCardSubmitter} numberOfLines={1}>
            SUBMITTED BY {row.display_name.toUpperCase()}
            {forfeit ? " · DIDN'T VOTE" : ""}
          </Text>
        </View>
        <View style={styles.resultCardPtsStack}>
          <Text style={styles.resultCardPts}>+{points}</Text>
          <Text style={styles.resultCardPtsLabel}>pts</Text>
        </View>
      </View>

      {voters.length > 0 ? (
        <>
          <View style={styles.resultCardDivider} />
          <View style={styles.voterList}>
            {voters.map((v, i) => {
              const hasComment = (v.comment ?? "").trim().length > 0;
              return (
                <View key={v.voter_user_id}>
                  {i > 0 ? <View style={styles.voterDivider} /> : null}
                  <View style={styles.voterRowNew}>
                    <ChromeBorder
                      radius={14}
                      thickness={1.5}
                      innerBg={pastelFor(v.voter_user_id)}
                      clip
                      style={styles.voterAvatarFrame}
                    >
                      <View style={styles.voterAvatarCenter}>
                        <Text style={styles.voterAvatarInitial}>
                          {(v.voter_name ?? "?").charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    </ChromeBorder>
                    <View style={styles.voterTextCol}>
                      <Text style={styles.voterNameNew} numberOfLines={1}>
                        {v.voter_name}
                      </Text>
                      {hasComment ? (
                        <Text style={styles.voterCommentNew}>
                          &ldquo;{v.comment}&rdquo;
                        </Text>
                      ) : null}
                    </View>
                    <View
                      style={[
                        styles.voterPtsPill,
                        v.points === 0 && styles.voterPtsPillZero,
                      ]}
                    >
                      <Text style={styles.voterPtsPillText}>+{v.points}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function RoundScreen({
  roundId,
  seasonId,
}: {
  roundId: string;
  seasonId?: string;
}) {
  void seasonId;
  const router = useRouter();
  const { supabaseUserId } = useSession();
  const userId = supabaseUserId;
  const bottomInset = useTabBarBottomInset();

  const { data: round, isLoading: roundLoading, refetch: refetchRound } =
    useRound(roundId);
  const roundSeasonId = round?.season_id;
  const leagueId = round?.seasons?.league_id;

  const { data: prevRound, refetch: refetchPrevRound } = usePreviousRound(
    roundSeasonId,
    round?.round_number,
  );
  const { data: league, refetch: refetchLeague } = useLeague(leagueId);
  const { data: myRoleData, refetch: refetchMyRole } = useMyRole(
    leagueId,
    userId ?? undefined,
  );
  const { data: totalRoundsData, refetch: refetchTotalRounds } =
    useRoundCountForSeason(roundSeasonId);

  const isCommissioner = !!userId && league?.admin_user_id === userId;
  const myRole: "participant" | "spectator" =
    myRoleData === "spectator" ? "spectator" : "participant";
  const totalRounds = totalRoundsData ?? 0;

  const { data: submissionsData, refetch: refetchSubmissions } =
    useRoundSubmissions(roundId);
  const { data: myVotesData, refetch: refetchMyVotes } = useMyVotes(
    roundId,
    userId ?? undefined,
  );
  const submissions: Submission[] = submissionsData ?? [];
  const myVotes = myVotesData ?? {};

  useFocusEffect(
    useCallback(() => {
      refetchRound();
      refetchPrevRound();
      refetchLeague();
      refetchMyRole();
      refetchTotalRounds();
      refetchSubmissions();
      refetchMyVotes();
    }, [
      refetchRound,
      refetchPrevRound,
      refetchLeague,
      refetchMyRole,
      refetchTotalRounds,
      refetchSubmissions,
      refetchMyVotes,
    ]),
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refetchRound(),
      refetchPrevRound(),
      refetchLeague(),
      refetchMyRole(),
      refetchTotalRounds(),
      refetchSubmissions(),
      refetchMyVotes(),
    ]);
    setRefreshing(false);
  }, [
    refetchRound,
    refetchPrevRound,
    refetchLeague,
    refetchMyRole,
    refetchTotalRounds,
    refetchSubmissions,
    refetchMyVotes,
  ]);

  const scrollViewRef = useRef<ScrollView>(null);
  const scrollToTop = useCallback(() => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const forceEndRoundMutation = useForceEndRound();

  const forceCloseVoting = useCallback(() => {
    if (!round) return;
    Alert.alert(
      "Force end voting?",
      "This will immediately close the voting window and move the round to results.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End Voting",
          style: "destructive",
          onPress: async () => {
            try {
              await forceEndRoundMutation.mutateAsync({
                roundId: round.id,
                seasonId: round.season_id,
              });
            } catch (err) {
              Alert.alert(
                "Failed to end voting",
                err instanceof MixError ? err.message : "Unknown error",
              );
            }
          },
        },
      ],
    );
  }, [forceEndRoundMutation, round]);

  if (roundLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={THEME.muted} />
      </View>
    );
  }

  if (!round) {
    return (
      <View style={styles.centered}>
        <Text style={styles.mutedHint}>Round not found.</Text>
      </View>
    );
  }

  const phase = derivePhase(round, prevRound ?? null);
  const mySubmissions = submissions.filter((s) => s.user_id === userId);
  const countdown = formatPhaseCountdown(round, prevRound ?? null);

  // Voting phase gets the iridescent-wash treatment with a full-bleed hero
  // (image/video, fades into the wash). No bubblegum halftone overlay here —
  // the hero is the focal point and the dots would clash.
  if (phase === "voting" && userId) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={88}
      >
        <Wallpaper halftone={false}>
          <ScrollView
            ref={scrollViewRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={THEME.ink}
              />
            }
          >
            <VotingScreenContent
              round={round}
              userId={userId}
              submissions={submissions}
              myVotes={myVotes}
              didSubmit={mySubmissions.length > 0}
              isSpectator={myRole === "spectator"}
              isCommissioner={isCommissioner}
              countdown={countdown}
              leagueName={league?.name}
              onVoted={() => {
                void refetchRound();
                scrollToTop();
              }}
              onBack={() => router.back()}
              onForceEnd={forceCloseVoting}
            />
          </ScrollView>
        </Wallpaper>
      </KeyboardAvoidingView>
    );
  }

  // Submissions phase gets the Bubblegum wallpaper treatment — edge-to-edge
  // halftone, big italic hero, chrome accents. Voting / upcoming keep the
  // existing cream-paper layout for now (scoped redesign).
  if (phase === "submissions" && userId && myRole !== "spectator") {
    const pickNum = String(round.round_number).padStart(2, "0");
    const leagueName = league?.name;
    return (
      <>
        {/* Dynamically inject the round/league pill into the native nav
            header so it sits at the same Y as the iOS liquid-glass back
            chevron — visually just under the notch. */}
        <Stack.Screen
          options={{
            headerTitle: () => (
              <View style={styles.heroTopPill}>
                <ChromeText
                  glyph="✦"
                  size={9}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.heroTopPillText} numberOfLines={1}>
                  R{pickNum} · SUBMIT
                  {leagueName ? ` · ${leagueName.toUpperCase()}` : ""}
                </Text>
              </View>
            ),
          }}
        />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={88}
        >
          <Wallpaper>
            <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
              <ScrollView
                ref={scrollViewRef}
                contentContainerStyle={[
                  styles.submitScroll,
                  { paddingBottom: bottomInset + 24 },
                ]}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor={THEME.ink}
                  />
                }
              >
                <SubmissionsHero round={round} countdown={countdown} />
                <SubmissionPhase
                  round={round}
                  userId={userId}
                  mySubmissions={mySubmissions}
                  onSubmitted={() => router.back()}
                />
              </ScrollView>
            </SafeAreaView>
          </Wallpaper>
        </KeyboardAvoidingView>
      </>
    );
  }

  // Results phase renders an edge-to-edge hero — skip PageHeader.
  if (phase === "results") {
    return (
      <Wallpaper halftone={false}>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView
          ref={scrollViewRef}
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
          {round.seasons?.status === "completed" &&
            round.round_number === totalRounds && (
              <TouchableOpacity
                style={styles.seasonCompleteBanner}
                onPress={() =>
                  router.push({
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    pathname: "/(tabs)/(home)/season/[id]" as any,
                    params: { id: round.season_id, initialTab: "standings" },
                  })
                }
                activeOpacity={0.8}
              >
                <Text style={styles.seasonCompleteEmoji}>🏆</Text>
                <View style={styles.seasonCompleteText}>
                  <Text style={styles.seasonCompleteTitle}>Season complete!</Text>
                  <Text style={styles.seasonCompleteSub}>
                    See the final standings →
                  </Text>
                </View>
              </TouchableOpacity>
            )}

          <ResultsPhase
            round={round}
            submissions={submissions}
            leagueName={league?.name}
            totalRounds={totalRounds}
            onBack={() => router.back()}
          />
        </ScrollView>
        </SafeAreaView>
      </Wallpaper>
    );
  }

  // Non-results phases — cream page with PageHeader and the existing phase
  // layouts restyled but otherwise untouched.
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: THEME.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={88}
    >
      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1, backgroundColor: THEME.bg }}
        contentContainerStyle={[
          styles.root,
          { paddingBottom: bottomInset + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={THEME.accent}
          />
        }
      >
        <PageHeader
          leagueTag={league?.name}
          title={`Round ${round.round_number}`}
          trailing={
            isCommissioner && phase === "voting" ? (
              <TouchableOpacity
                onPress={forceCloseVoting}
                style={styles.headerActionBtn}
              >
                <Text style={styles.headerActionText}>Force end</Text>
              </TouchableOpacity>
            ) : undefined
          }
        />

        <View style={styles.pagePad}>
          <Text style={styles.phaseCountdown}>{countdown}</Text>

          <View style={styles.promptCard}>
            <Text style={styles.promptLabel}>PROMPT</Text>
            <Text style={styles.promptText}>{round.prompt}</Text>
            {round.description ? (
              <Text style={styles.promptDescription}>{round.description}</Text>
            ) : null}
          </View>

          <View style={styles.deadlines}>
            <Text style={styles.deadlineItem}>
              Subs close{" "}
              <Text style={styles.deadlineValue}>
                {formatDeadline(round.submission_deadline_at)}
              </Text>
            </Text>
            <Text style={styles.deadlineItem}>
              Votes close{" "}
              <Text style={styles.deadlineValue}>
                {formatDeadline(round.voting_deadline_at)}
              </Text>
            </Text>
          </View>

          {phase === "upcoming" && prevRound && (
            <View style={styles.upcomingCard}>
              <Text style={styles.upcomingText}>
                Opens when &ldquo;{prevRound.prompt}&rdquo; closes on{" "}
                {formatDeadline(prevRound.voting_deadline_at)}
              </Text>
            </View>
          )}

          {phase === "submissions" &&
            userId &&
            (myRole === "spectator" ? (
              <View style={styles.spectatorPlaylistCard}>
                <Text style={styles.spectatorPlaylistEmoji}>🎵</Text>
                <Text style={styles.spectatorPlaylistTitle}>
                  A playlist is forming
                </Text>
                <Text style={styles.spectatorPlaylistBody}>
                  Participants are locking in their picks for &ldquo;
                  {round.prompt}&rdquo;. You&apos;ll be able to listen once
                  submissions close.
                </Text>
              </View>
            ) : (
              <SubmissionPhase
                round={round}
                userId={userId}
                mySubmissions={mySubmissions}
                onSubmitted={() => router.back()}
              />
            ))}

          {phase === "voting" && userId && (
            <VotingPhase
              round={round}
              userId={userId}
              submissions={submissions}
              myVotes={myVotes}
              didSubmit={mySubmissions.length > 0}
              isSpectator={myRole === "spectator"}
              onVoted={refetchRound}
              onScrollToTop={scrollToTop}
            />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: THEME.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  root: {
    backgroundColor: THEME.bg,
    gap: 16,
  },
  pagePad: {
    paddingHorizontal: 22,
    gap: 16,
  },

  headerActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.accent,
  },
  headerActionText: {
    fontFamily: THEME.fonts.sansSemi,
    fontSize: 12,
    color: THEME.accent,
  },

  phaseCountdown: {
    ...THEME.text.homeLiveLabel,
    color: THEME.muted,
  },

  promptCard: {
    backgroundColor: THEME.surface,
    borderRadius: 14,
    padding: 16,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.rule,
  },
  promptLabel: {
    ...THEME.text.seasonsLabel,
  },
  promptText: {
    ...THEME.text.homeHeroPrompt,
    fontSize: 22,
    lineHeight: 26,
    marginTop: 2,
  },
  promptDescription: {
    ...THEME.text.sectionMeta,
    marginTop: 8,
    lineHeight: 18,
  },

  deadlines: { gap: 4 },
  deadlineItem: {
    fontFamily: THEME.fonts.sansMedium,
    fontSize: 12,
    color: THEME.muted,
  },
  deadlineValue: {
    fontFamily: THEME.fonts.sansSemi,
    color: THEME.ink,
  },

  upcomingCard: {
    backgroundColor: THEME.surface,
    borderRadius: 10,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.rule,
  },
  upcomingText: {
    fontFamily: THEME.fonts.serifItalic,
    fontSize: 14,
    color: THEME.muted,
    lineHeight: 20,
  },

  // Phase card
  phaseCard: {
    backgroundColor: THEME.surface,
    borderRadius: 14,
    padding: 16,
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.rule,
  },
  phaseLabel: {
    ...THEME.text.seasonsLabel,
  },
  mutedHint: {
    fontFamily: THEME.fonts.sansMedium,
    fontSize: 12,
    color: THEME.muted,
  },

  // Themed button
  themedBtn: {
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  themedBtnText: {
    fontFamily: THEME.fonts.sansSemi,
    fontSize: 14,
  },

  // Points
  pointsBar: { flexDirection: "row", alignItems: "baseline" },
  pointsRemaining: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 22,
    color: THEME.ink,
  },

  // Submission row
  mySubmissionRow: {
    backgroundColor: THEME.bg,
    borderRadius: 10,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.rule,
  },
  changeRow: {
    minHeight: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  changeRowPlaceholder: {
    fontSize: 12,
    fontWeight: "600",
    color: "transparent",
  },
  clearSlotText: {
    fontFamily: THEME.fonts.sansSemi,
    fontSize: 12,
    color: THEME.muted,
  },
  hiddenChangeText: { color: "transparent" },
  editTrackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  editArtworkPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  editArtworkPlaceholderText: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 22,
    color: THEME.muted,
  },
  editTrackMeta: { flex: 1 },
  inlineInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.rule,
    paddingLeft: 12,
    paddingRight: 8,
  },
  inlineSearchInput: {
    flex: 1,
    minHeight: 48,
    color: THEME.ink,
    fontSize: 14,
    paddingVertical: 10,
    fontFamily: THEME.fonts.sans,
  },
  cancelEditBtn: { paddingHorizontal: 8, paddingVertical: 8 },
  cancelEditText: {
    color: THEME.muted,
    fontSize: 13,
    fontFamily: THEME.fonts.sansBold,
  },
  searchLoadingRow: {
    paddingVertical: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  resultRow: { paddingTop: 8, paddingBottom: 4 },

  commentInput: {
    marginTop: 10,
    minHeight: 68,
    backgroundColor: THEME.surface,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.rule,
    padding: 10,
    color: THEME.ink,
    fontSize: 13,
    fontFamily: THEME.fonts.sans,
  },

  // Track row (submission/voting phase, not the results TrackList)
  trackRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  artwork: { backgroundColor: THEME.rule },
  artworkPlaceholder: { backgroundColor: THEME.rule },
  trackMeta: { flex: 1, gap: 2 },
  trackTitle: {
    ...THEME.text.trackTitle,
  },
  trackArtist: {
    ...THEME.text.trackArtist,
  },

  // Voting — submission cards
  submissionVoteCard: {
    backgroundColor: THEME.bg,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.rule,
  },
  submissionVoteCardVoted: {
    borderColor: THEME.accent,
    backgroundColor: "#FBEEEE",
  },
  submissionVoteCardUnvoted: {
    borderColor: "transparent",
    backgroundColor: THEME.bg,
    opacity: 0.55,
  },
  ownTrackLabel: {
    ...THEME.text.seasonsLabel,
    color: THEME.accent,
  },
  voteStepper: { flexDirection: "row", alignItems: "center", gap: 6 },
  voteBtn: {
    width: 32,
    height: 32,
    backgroundColor: THEME.surface,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.rule,
  },
  voteBtnDisabled: { opacity: 0.3 },
  voteBtnText: {
    color: THEME.ink,
    fontSize: 18,
    fontFamily: THEME.fonts.sansMedium,
  },
  votePoints: {
    width: 28,
    textAlign: "center",
    fontSize: 16,
    fontFamily: THEME.fonts.sansBold,
    color: THEME.ink,
  },
  votedBanner: {
    backgroundColor: THEME.surface,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.accent,
  },
  votedBannerText: {
    color: THEME.accent,
    fontSize: 13,
    fontFamily: THEME.fonts.sansBold,
  },
  votedBannerSub: {
    color: THEME.muted,
    fontSize: 11,
    fontFamily: THEME.fonts.sansMedium,
  },
  spectatorCard: {
    backgroundColor: THEME.surface,
    borderRadius: 8,
    padding: 14,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.rule,
  },
  spectatorCardTitle: {
    color: THEME.ink,
    fontSize: 13,
    fontFamily: THEME.fonts.sansBold,
  },
  spectatorCardBody: {
    color: THEME.muted,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: THEME.fonts.sansMedium,
  },
  spectatorPlaylistCard: {
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    gap: 12,
    backgroundColor: THEME.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.rule,
  },
  spectatorPlaylistEmoji: { fontSize: 48 },
  spectatorPlaylistTitle: {
    fontSize: 18,
    fontFamily: THEME.fonts.sansBold,
    color: THEME.ink,
    textAlign: "center",
  },
  spectatorPlaylistBody: {
    fontSize: 13,
    color: THEME.muted,
    lineHeight: 20,
    textAlign: "center",
    fontFamily: THEME.fonts.sansMedium,
  },
  seasonCompleteBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: THEME.surface,
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 22,
    marginTop: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.accent,
  },
  seasonCompleteEmoji: { fontSize: 36 },
  seasonCompleteText: { flex: 1, gap: 3 },
  seasonCompleteTitle: {
    fontSize: 16,
    fontFamily: THEME.fonts.sansBold,
    color: THEME.ink,
  },
  seasonCompleteSub: {
    fontSize: 12,
    color: THEME.muted,
    fontFamily: THEME.fonts.sansMedium,
  },
  ineligibleBanner: {
    backgroundColor: THEME.surface,
    borderRadius: 8,
    padding: 12,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.rule,
  },
  ineligibleTitle: {
    color: THEME.ink,
    fontSize: 13,
    fontFamily: THEME.fonts.sansBold,
  },
  ineligibleSub: {
    color: THEME.muted,
    fontSize: 11,
    fontFamily: THEME.fonts.sansMedium,
  },
  lockedPts: {
    fontSize: 12,
    fontFamily: THEME.fonts.sansBold,
    color: THEME.accent,
  },
  lockedPtsNone: {
    fontSize: 12,
    color: THEME.faint,
    fontFamily: THEME.fonts.sansMedium,
  },

  // Voters & comments section
  votersSection: {
    paddingHorizontal: 22,
    paddingTop: 24,
    gap: 14,
  },
  sectionEyebrow: {
    ...THEME.text.seasonsLabel,
  },
  voterGroup: {
    backgroundColor: THEME.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.rule,
    gap: 6,
  },
  voterGroupTitle: {
    ...THEME.text.trackTitle,
  },
  voterGroupSub: {
    ...THEME.text.trackArtist,
  },
  votersThread: {
    marginTop: 6,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.rule,
  },
  voterRow: {
    backgroundColor: THEME.bg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  voterRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: THEME.rule,
  },
  voterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  voterName: {
    fontSize: 12,
    fontFamily: THEME.fonts.sansBold,
    color: THEME.ink,
  },
  voterPoints: {
    fontSize: 13,
    fontFamily: THEME.fonts.sansBold,
    color: THEME.accent,
  },
  voterPointsZero: { color: THEME.faint },
  voterComment: {
    fontSize: 12,
    color: THEME.muted,
    fontFamily: THEME.fonts.serifItalic,
    lineHeight: 17,
  },

  submissionComment: {
    marginTop: 8,
    color: THEME.muted,
    fontSize: 12,
    fontFamily: THEME.fonts.serifItalic,
    lineHeight: 17,
  },

  // Forfeits
  forfeitSection: {
    paddingHorizontal: 22,
    paddingTop: 24,
    gap: 10,
  },
  forfeitDividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  forfeitDividerLine: { flex: 1, height: 1, backgroundColor: THEME.rule },
  forfeitDividerLabel: {
    ...THEME.text.seasonsLabel,
  },
  forfeitHelp: {
    fontSize: 11,
    color: THEME.muted,
    lineHeight: 16,
    fontFamily: THEME.fonts.serifItalic,
  },
  forfeitItem: {
    backgroundColor: THEME.surface,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.rule,
    opacity: 0.7,
  },
  forfeitItemHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  forfeitItemName: {
    fontFamily: THEME.fonts.sansSemi,
    fontSize: 13,
    color: THEME.ink,
  },
  forfeitBadge: {
    fontSize: 9,
    fontFamily: THEME.fonts.sansBold,
    letterSpacing: 1,
    color: THEME.muted,
    backgroundColor: THEME.bg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },

  commentInputField: {
    flex: 1,
    backgroundColor: THEME.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: THEME.ink,
    fontFamily: THEME.fonts.sans,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.rule,
  },

  // ─── Bubblegum submissions screen ─────────────────────────────────────────

  submitScroll: {
    paddingHorizontal: 22,
    paddingTop: 12,
    gap: 16,
  },

  // Hero block (tagline + big title + closes pill). The R0X · SUBMIT pill
  // that used to live at the top of this block now sits in the native nav
  // header (Stack.Screen options.headerTitle) so it lines up with the back
  // chevron at the same Y as the liquid-glass bar.
  heroBlock: {
    alignItems: "center",
    // Headroom for the transparent nav header overlaying the top of the
    // content area. ~44pt nav bar + 8pt breathing room.
    paddingTop: 52,
    paddingBottom: 6,
    gap: 8,
  },
  heroTopPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: THEME.ink,
    // Lift above the title's halo spill so the BlurView doesn't capture
    // this pill's pixels. See `ui/HaloText.tsx` for the rule.
    zIndex: 1,
  },
  heroTopPillText: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: "#FFD9EC",
  },
  heroTagline: {
    fontFamily: THEME.fonts.serifItalic,
    fontSize: 16,
    color: THEME.ink,
    zIndex: 1,
  },
  heroTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    paddingHorizontal: 28,
    paddingVertical: 28,
    marginTop: -4,
    marginBottom: -4,
    // No overflow:hidden / borderRadius — the halo layers below carry their
    // own radial alpha mask. Any clipping here would chop the soft falloff
    // into a hard rectangle.
  },
  heroTitle: {
    fontFamily: THEME.fonts.serifBoldItalic,
    fontSize: 74,
    lineHeight: 80,
    letterSpacing: -3,
    color: THEME.ink,
    textAlign: "center",
  },
  closesPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(26,8,20,0.85)",
    marginTop: 6,
    zIndex: 1,
  },
  closesPillText: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: "#FFD9EC",
  },

  // Pick slot card body
  submitBody: {
    gap: 14,
    marginTop: 6,
  },
  // Inner content of a ChromeBorder-wrapped pick card. The ChromeBorder
  // owns the radius + bg; this just pads + spaces the children.
  pickCardInner: {
    padding: 14,
    gap: 12,
  },
  pickHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickEyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  pickEyebrow: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: THEME.ink,
  },
  pickEyebrowDot: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: THEME.muted,
  },
  pickEyebrowState: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: THEME.ink,
  },
  // Dark plum pill — matches the top R0X · SUBMIT chip and the embedded
  // "+ ADD PICK NN" button below editors.
  editChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: THEME.ink,
  },
  editChipText: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: "#FFD9EC",
  },
  pickTrackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pickArt: {
    width: 56,
    height: 56,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: THEME.chrome.border,
  },
  pickArtPlaceholder: {
    backgroundColor: "rgba(26,8,20,0.08)",
  },
  pickMeta: {
    flex: 1,
    gap: 2,
  },
  pickTitle: {
    fontFamily: THEME.fonts.serifBold,
    fontStyle: "italic",
    fontSize: 18,
    letterSpacing: -0.3,
    color: THEME.ink,
  },
  pickArtist: {
    fontFamily: THEME.fonts.sansMedium,
    fontSize: 12,
    color: THEME.muted,
  },
  pickCommentInput: {
    minHeight: 36,
    backgroundColor: "rgba(255,255,255,0.5)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: THEME.ink,
    fontSize: 13,
    fontFamily: THEME.fonts.sans,
    borderWidth: 1,
    borderColor: THEME.rule,
  },

  // Search row content (ChromeBorder supplies the ring + bg)
  searchInputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  searchGlyph: {
    fontSize: 18,
    color: THEME.ink,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 10,
    color: THEME.ink,
    fontFamily: THEME.fonts.sans,
    fontSize: 14,
  },
  searchResultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: THEME.rule,
  },
  searchResultTitle: {
    fontFamily: THEME.fonts.serifBold,
    fontStyle: "italic",
    fontSize: 15,
    color: THEME.ink,
  },
  searchResultArtist: {
    fontFamily: THEME.fonts.sansMedium,
    fontSize: 12,
    color: THEME.muted,
  },

  // ─── Track duration limit rejection banner ────────────────────────────────
  trackLimitBanner: {
    backgroundColor: THEME.ink,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C4FF3D",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  trackLimitBannerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  trackLimitBannerLeft: {
    flex: 1,
    gap: 4,
  },
  trackLimitTagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trackLimitTag: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 9,
    letterSpacing: 1.8,
    color: "#C4FF3D",
  },
  trackLimitDuration: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 12,
    color: "#FFD9EC",
  },
  trackLimitHint: {
    fontFamily: THEME.fonts.sansMedium,
    fontSize: 11,
    color: "rgba(255,217,236,0.55)",
  },
  trackLimitDismiss: {
    paddingLeft: 12,
  },
  trackLimitDismissGlyph: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 18,
    color: "rgba(255,217,236,0.5)",
    lineHeight: 20,
  },

  // ─── Voting hero overlay (title + meta + buttons under the faded image) ──

  voteTitleBlock: {
    paddingHorizontal: 28,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 8,
    alignItems: "center",
  },
  // Overlay anchored to the bottom of the hero rectangle. Title + meta sit
  // on the faded portion of the image; buttons start in normal flow below.
  voteTitleOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 18,
    paddingHorizontal: 28,
    alignItems: "center",
    gap: 8,
  },
  voteTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  voteTitleStar: {
    marginLeft: 6,
    marginTop: 4,
  },
  voteTitleOnHero: {
    fontFamily: THEME.fonts.serifBoldItalic,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.6,
    color: "#fff",
    textAlign: "center",
  },
  voteTitle: {
    fontFamily: THEME.fonts.serifBoldItalic,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.6,
    color: THEME.ink,
    textAlign: "center",
  },
  voteMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  voteMetaPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#2a0e4a",
  },
  voteMetaPillText: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: "#e8d5ff",
  },
  voteMetaTail: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: THEME.ink,
  },
  voteButtonsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 22,
    // Pulled snug against the bottom of the hero rectangle. The video has
    // already faded to transparent there, so the buttons sit on the wash
    // immediately below the (invisible) bottom edge of the hero.
    marginTop: 8,
    marginBottom: 18,
  },
  voteBtnInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 26,
  },
  voteBtnDarkBg: {
    backgroundColor: "#2a0e4a",
  },
  voteBtnLightBg: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1.5,
    borderColor: THEME.chrome.border,
  },
  forceEndWrap: {
    marginTop: 20,
  },
  voteBtnLabelDark: {
    fontFamily: THEME.fonts.sansSemi,
    fontSize: 14,
    color: THEME.ink,
  },
  voteBtnLabelLight: {
    fontFamily: THEME.fonts.sansSemi,
    fontSize: 14,
    color: "#e8d5ff",
  },
  votePlayTriangle: {
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
  voteBtnGlyphLight: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 18,
    color: "#e8d5ff",
  },

  // ─── Voting playlist (Bubblegum hero+playlist layout) ────────────────────

  votePlaylist: {
    paddingHorizontal: 18,
    paddingTop: 4,
    gap: 6,
  },
  voteBanner: {
    backgroundColor: "rgba(255,255,255,0.45)",
    borderRadius: 14,
    padding: 14,
    gap: 4,
    marginBottom: 10,
  },
  voteBannerTitle: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 13,
    color: THEME.ink,
  },
  voteBannerBody: {
    fontFamily: THEME.fonts.sansMedium,
    fontSize: 12,
    color: THEME.muted,
    lineHeight: 17,
  },
  votePointsBar: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 6,
  },
  votePointsRemaining: {
    fontFamily: THEME.fonts.serifBold,
    fontStyle: "italic",
    fontSize: 26,
    color: THEME.ink,
  },
  votePointsHint: {
    fontFamily: THEME.fonts.sansMedium,
    fontSize: 12,
    color: THEME.muted,
  },
  voteRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 10,
  },
  voteRowTapArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  voteRowNum: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: THEME.muted,
    width: 22,
    textAlign: "left",
  },
  voteRowNumActive: {
    color: THEME.ink,
    fontSize: 12,
    letterSpacing: 0,
  },
  voteRowArt: {
    width: 44,
    height: 44,
  },
  voteRowArtPlaceholder: {
    backgroundColor: "rgba(26,8,20,0.08)",
    borderRadius: 8,
  },
  voteRowMeta: {
    flex: 1,
    gap: 2,
  },
  voteRowTitle: {
    fontFamily: THEME.fonts.serifBold,
    fontStyle: "italic",
    fontSize: 16,
    letterSpacing: -0.3,
    color: THEME.ink,
  },
  voteRowArtist: {
    fontFamily: THEME.fonts.sansMedium,
    fontSize: 12,
    color: THEME.muted,
  },
  // Inline stepper row: ▲ count ▼ on one horizontal line.
  voteStack: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  voteArrow: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  voteArrowDisabled: {
    opacity: 1,
  },
  voteArrowGlyph: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 14,
    color: THEME.ink,
  },
  voteArrowGlyphDisabled: {
    color: "rgba(26,8,20,0.25)",
  },
  voteCount: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 18,
    color: THEME.ink,
    minWidth: 24,
    textAlign: "center",
  },
  voteLocked: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 9,
    letterSpacing: 1.2,
    color: THEME.muted,
  },
  voteOwnLabel: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 9,
    letterSpacing: 1.4,
    color: THEME.muted,
    textAlign: "center",
    minWidth: 48,
  },
  commentIconBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginLeft: 4,
  },
  // Read-only indicator that matches the comment-icon button's footprint so
  // the row layout doesn't shift between voting and submitted states.
  commentIndicator: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginLeft: 4,
  },
  commentIconGlyph: {
    fontSize: 18,
    opacity: 0.55,
  },
  commentIconGlyphActive: {
    opacity: 1,
  },
  commentAccordion: {
    marginHorizontal: 10,
    marginTop: 4,
    marginBottom: 10,
    position: "relative",
    // Clip in-flight renders of inner content to the accordion's animated
    // frame so the Save/Edit pill can't paint outside the collapsing View
    // during the LayoutAnimation delete pass.
    overflow: "hidden",
  },
  commentAccordionInput: {
    minHeight: 64,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderRadius: 12,
    paddingLeft: 12,
    paddingRight: 84, // reserved gutter so the typed text never collides
                      // with the absolute-positioned Save/Edit button on the right
    paddingVertical: 10,
    color: THEME.ink,
    fontFamily: THEME.fonts.sans,
    fontSize: 13,
    borderWidth: 1,
    borderColor: "rgba(26,8,20,0.12)",
  },
  // Invisible vertical-center slot anchored to the right of the textbox.
  // Stretches to the input's full height so its child button can sit at the
  // optical center regardless of how tall the input grows.
  commentInlineBtnSlot: {
    position: "absolute",
    right: 8,
    top: 0,
    bottom: 0,
    width: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  // The actual pill — small, padded, NOT stretched. Same footprint whether
  // showing "Save" or "Edit".
  commentInlineBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    minWidth: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  trackDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 6,
    backgroundColor: "rgba(26,8,20,0.12)",
  },

  // ─── Results screen ──────────────────────────────────────────────────────

  resultsHeader: {
    alignItems: "center",
    paddingTop: 52,
    paddingHorizontal: 28,
    paddingBottom: 10,
    gap: 6,
  },
  resultsEyebrow: {
    fontFamily: THEME.fonts.serifItalic,
    fontSize: 14,
    color: THEME.ink,
  },
  resultsTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: 2,
  },
  // Last word + chrome ★ share this group; nowrap means the star is
  // glued to the last word and they break to a new line together.
  resultsTitleTailGroup: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
  },
  resultsTitle: {
    fontFamily: THEME.fonts.serifBoldItalic,
    fontSize: 56,
    lineHeight: 54,
    letterSpacing: -2.2,
    // Same plum as the "Go to playlist" pill fill — keeps the headline
    // tied to the CTA below it as one color block.
    color: "#2a0e4a",
    textAlign: "center",
  },
  resultsTitleStar: {
    marginLeft: 6,
    marginTop: 6,
  },
  resultsMeta: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: THEME.ink,
    marginTop: 4,
  },
  goPlaylistPill: {
    marginTop: 10,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "#2a0e4a",
  },
  goPlaylistPillText: {
    fontFamily: THEME.fonts.sansSemi,
    fontSize: 13,
    letterSpacing: 0.4,
    color: "#e8d5ff",
  },

  // Podium
  podiumRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    marginTop: 14,
    marginBottom: 20,
    gap: 8,
  },
  podiumCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  podiumArtWrap: {
    position: "relative",
  },
  podiumArtImg: {
    width: "100%",
    height: "100%",
  },
  podiumArtPlaceholder: {
    backgroundColor: "rgba(26,8,20,0.08)",
  },
  // Corner badge (1/2/3) anchored to the top-left of the art tile.
  podiumBadgeWrap: {
    position: "absolute",
    top: -6,
    left: -6,
  },
  podiumBadge: {
    width: 28,
    height: 28,
  },
  podiumBadgeCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  podiumBadgeText: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 13,
    color: "#2a0e4a",
  },
  // Metal platform anchoring each column. Width fills the column; height
  // varies by rank (1st > 2nd > 3rd) to give the literal podium silhouette.
  podiumBar: {
    alignSelf: "stretch",
    borderRadius: 8,
    marginTop: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  podiumBarPts: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 22,
    color: "#2a0e4a",
    lineHeight: 24,
    // Subtle highlight + shadow so the number reads as embossed metal.
    textShadowColor: "rgba(255,255,255,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  podiumBarOrdinal: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 9,
    letterSpacing: 1.6,
    color: "rgba(42,14,74,0.72)",
    marginTop: 1,
  },
  podiumTitle: {
    fontFamily: THEME.fonts.serifBold,
    fontStyle: "italic",
    fontSize: 14,
    color: THEME.ink,
    textAlign: "center",
    marginTop: 4,
  },
  podiumArtist: {
    fontFamily: THEME.fonts.sansMedium,
    fontSize: 11,
    color: THEME.muted,
    textAlign: "center",
  },
  podiumSubmitter: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 9,
    letterSpacing: 1.2,
    color: THEME.ink,
    marginTop: 2,
    textAlign: "center",
  },

  // Full results section header
  fullResultsHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 22,
    marginTop: 6,
    marginBottom: 10,
    gap: 10,
  },
  fullResultsLabel: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: THEME.ink,
  },
  fullResultsRule: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(26,8,20,0.28)",
  },

  // Result card
  resultsList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  resultCard: {
    backgroundColor: "rgba(255,255,255,0.55)",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  resultCardForfeit: {
    opacity: 0.55,
  },
  resultCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  resultCardArtWrap: {
    position: "relative",
    width: 56,
    height: 56,
  },
  resultCardArt: {
    width: 56,
    height: 56,
  },
  resultCardArtPh: {
    backgroundColor: "rgba(26,8,20,0.08)",
    borderRadius: 10,
  },
  // Corner place badge — metal disc for 1/2/3 (matches podium), plain
  // muted-plum circle with the number for 4th+.
  resultBadgeWrap: {
    position: "absolute",
    top: -6,
    left: -6,
  },
  resultBadge: {
    width: 24,
    height: 24,
  },
  resultBadgeText: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 11,
    color: "#2a0e4a",
  },
  resultBadgePlainWrap: {
    position: "absolute",
    top: -6,
    left: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(26,8,20,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  resultBadgePlainText: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 11,
    color: "#2a0e4a",
  },
  resultCardMeta: {
    flex: 1,
    gap: 1,
  },
  resultCardTitle: {
    fontFamily: THEME.fonts.serifBold,
    fontStyle: "italic",
    fontSize: 16,
    letterSpacing: -0.3,
    color: THEME.ink,
  },
  resultCardArtist: {
    fontFamily: THEME.fonts.sansMedium,
    fontSize: 12,
    color: THEME.muted,
  },
  resultCardSubmitter: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 9,
    letterSpacing: 1.2,
    color: THEME.ink,
    marginTop: 1,
  },
  resultCardPtsStack: {
    alignItems: "flex-end",
    minWidth: 50,
  },
  resultCardPts: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 22,
    lineHeight: 24,
    color: "#2a0e4a",
  },
  resultCardPtsLabel: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: THEME.muted,
    marginTop: 1,
  },
  resultCardDivider: {
    height: 1,
    marginVertical: 10,
    backgroundColor: "rgba(26,8,20,0.12)",
  },

  // Voter rows inside a result card
  voterList: {
    gap: 8,
  },
  voterRowNew: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  voterAvatarFrame: {
    width: 28,
    height: 28,
  },
  voterAvatarCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  voterAvatarInitial: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 11,
    color: THEME.ink,
  },
  voterTextCol: {
    flex: 1,
    gap: 1,
  },
  voterNameNew: {
    fontFamily: THEME.fonts.sansSemi,
    fontSize: 13,
    color: THEME.ink,
  },
  voterCommentNew: {
    fontFamily: THEME.fonts.serifItalic,
    fontSize: 13,
    lineHeight: 17,
    color: THEME.muted,
  },
  voterPtsNew: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 14,
    color: THEME.ink,
    minWidth: 30,
    textAlign: "right",
  },
  voterPtsNewZero: {
    color: "rgba(26,8,20,0.35)",
  },
  voterDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(26,8,20,0.12)",
    marginVertical: 8,
    marginLeft: 38, // align with text column, skipping the avatar
  },
  voterPtsPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#2a0e4a",
    minWidth: 44,
    alignItems: "center",
  },
  voterPtsPillZero: {
    backgroundColor: "rgba(26,8,20,0.25)",
  },
  voterPtsPillText: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 12,
    color: "#e8d5ff",
  },
  commentAccordionInputSaved: {
    backgroundColor: "rgba(42,14,74,0.07)",
    borderColor: "rgba(42,14,74,0.18)",
    color: THEME.muted,
  },
  commentPrimaryBtn: {
    borderRadius: 999,
    backgroundColor: "#2a0e4a",
  },
  commentPrimaryBtnDisabled: {
    opacity: 0.4,
  },
  commentPrimaryBtnText: {
    fontFamily: THEME.fonts.sansSemi,
    fontSize: 12,
    color: "#e8d5ff",
    letterSpacing: 0.4,
  },
  commentSecondaryBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2a0e4a",
    backgroundColor: "transparent",
  },
  commentSecondaryBtnText: {
    fontFamily: THEME.fonts.sansSemi,
    fontSize: 12,
    color: "#2a0e4a",
    letterSpacing: 0.4,
  },

  // Dark plum pill embedded at the bottom of the editor card. Replaces the
  // standalone ChromeBorder peek tile.
  addPickInline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: THEME.ink,
    marginTop: 4,
  },
  addPickInlineText: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 11,
    letterSpacing: 1.8,
    color: "#FFD9EC",
  },
  // Search result row — chrome-bordered art tile on left, italic title +
  // muted artist in the middle, chrome "+" glyph on the right.
  searchResultArt: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  searchResultArtPlaceholder: {
    backgroundColor: "rgba(26,8,20,0.08)",
  },
  searchResultMeta: {
    flex: 1,
    gap: 2,
  },
  // Chrome ring around a white circle with a heavy plum "+". ChromeBorder
  // owns the radius + ring; the inner View centers the glyph. Shadow is
  // omitted because the outer gradient's `overflow: hidden` would clip it —
  // the metal ring itself provides the visual definition.
  addBubble: {
    width: 36,
    height: 36,
  },
  addBubbleCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  addBubbleGlyph: {
    fontFamily: THEME.fonts.sansBold,
    fontSize: 22,
    lineHeight: 24,
    color: THEME.ink,
    includeFontPadding: false,
  },
  addPickText: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 11,
    letterSpacing: 1.8,
    color: THEME.ink,
  },
});
