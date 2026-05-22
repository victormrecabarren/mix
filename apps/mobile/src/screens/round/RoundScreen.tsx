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
  ActivityIndicator,
  TextInput,
  Alert,
  Image,
  LayoutAnimation,
  UIManager,
} from "react-native";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useRouter, useFocusEffect } from "expo-router";
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
  spotify_track_id: string | null;
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

type DraftSubmission = {
  submissionId: string | null;
  track: SpotifyTrack | null;
  comment: string;
  searchInput: string;
  searchResults: SpotifyTrack[];
  isSearching: boolean;
  isEditingTrack: boolean;
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

function submissionToTrack(submission: Submission): SpotifyTrack {
  return {
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
  };
}

function createDraftSubmission(existing?: Submission): DraftSubmission {
  return {
    submissionId: existing?.id ?? null,
    track: existing ? submissionToTrack(existing) : null,
    comment: existing?.comment ?? "",
    searchInput: "",
    searchResults: [],
    isSearching: false,
    isEditingTrack: !existing,
  };
}

function comparableDraft(draft: DraftSubmission) {
  return {
    trackId: draft.track?.id ?? null,
    comment: draft.comment.trim(),
  };
}

// Submission rows are spotify-only today. Once SoundCloud is wired into the
// data model we'll dispatch on the URI source here.
// TODO: redesign in v2 — support multi-source submissions.
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
// TODO: redesign in v2 — submission slot / search row layout.

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
  const router = useRouter();
  const [drafts, setDrafts] = useState<DraftSubmission[]>([]);
  const searchRequestIds = useRef<Record<number, number>>({});
  const submitMutation = useSubmitRoundEntries();
  const submitting = submitMutation.isPending;

  const baselineDrafts = useMemo(
    () =>
      Array.from({ length: submissionsPerUser }, (_, i) =>
        createDraftSubmission(mySubmissions[i]),
      ),
    [mySubmissions, submissionsPerUser],
  );
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
        const linkedTrackId = extractSpotifyTrackId(trimmed);
        const nextResults = linkedTrackId
          ? [await getSpotifyTrack(linkedTrackId)]
          : await searchSpotifyTracks(trimmed);

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
      ...(searchInput.trim()
        ? {}
        : { searchResults: [], isSearching: false }),
    });
  };

  const selectTrack = (slotIndex: number, track: SpotifyTrack) => {
    const duplicateSlot = drafts.findIndex(
      (draft, i) => i !== slotIndex && draft.track?.id === track.id,
    );
    if (duplicateSlot !== -1) {
      Alert.alert(
        "Track already selected",
        `This track is already selected for the other submission.`,
      );
      return;
    }

    setSearchState(slotIndex, {
      track,
      searchInput: "",
      searchResults: [],
      isSearching: false,
      isEditingTrack: false,
    });
  };

  const openTrackEditor = (slotIndex: number) => {
    setSearchState(slotIndex, {
      isEditingTrack: true,
      searchInput: "",
      searchResults: [],
      isSearching: false,
    });
  };

  const cancelTrackEditor = (slotIndex: number) => {
    setSearchState(slotIndex, {
      isEditingTrack: false,
      searchInput: "",
      searchResults: [],
      isSearching: false,
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
      .filter((d) => d.track)
      .map((d) => {
        const t = d.track as SpotifyTrack;
        return {
          submissionId: d.submissionId,
          track: {
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

  return (
    <View style={styles.phaseCard}>
      <Text style={styles.phaseLabel}>YOUR SUBMISSIONS</Text>

      {drafts.map((draft, index) => (
        <View key={`slot-${index + 1}`} style={styles.mySubmissionRow}>
          {!!draft.track && (
            <View style={styles.changeRow}>
              {draft.isEditingTrack ? (
                <Text style={styles.changeRowPlaceholder}>Change</Text>
              ) : null}
              <TouchableOpacity onPress={() => openTrackEditor(index)}>
                <Text
                  style={[
                    styles.clearSlotText,
                    draft.isEditingTrack && styles.hiddenChangeText,
                  ]}
                >
                  Change
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {draft.isEditingTrack && (
            <>
              <View style={styles.editTrackRow}>
                <View
                  style={[
                    styles.artworkPlaceholder,
                    styles.editArtworkPlaceholder,
                  ]}
                >
                  <Text style={styles.editArtworkPlaceholderText}>♪</Text>
                </View>
                <View style={styles.editTrackMeta}>
                  <View style={styles.inlineInputRow}>
                    <TextInput
                      style={styles.inlineSearchInput}
                      placeholder="Search, or paste link"
                      placeholderTextColor={THEME.faint}
                      value={draft.searchInput}
                      onChangeText={(value) => updateSearchInput(index, value)}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {!!draft.track && (
                      <TouchableOpacity
                        style={styles.cancelEditBtn}
                        onPress={() => cancelTrackEditor(index)}
                      >
                        <Text style={styles.cancelEditText}>X</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
              {draft.isSearching && (
                <View style={styles.searchLoadingRow}>
                  <ActivityIndicator color={THEME.muted} size="small" />
                </View>
              )}
              {draft.searchResults.map((track) => (
                <TouchableOpacity
                  key={`${index}-${track.id}`}
                  style={styles.resultRow}
                  onPress={() => selectTrack(index, track)}
                >
                  <TrackRow
                    title={track.name}
                    artist={track.artists.map((a) => a.name).join(", ")}
                    artwork={track.album.images[0]?.url ?? null}
                  />
                </TouchableOpacity>
              ))}
            </>
          )}

          {!draft.isEditingTrack && draft.track ? (
            <TrackRow
              title={draft.track.name}
              artist={draft.track.artists.map((a) => a.name).join(", ")}
              artwork={draft.track.album.images[0]?.url ?? null}
            />
          ) : !draft.isEditingTrack ? (
            <Text style={styles.mutedHint}>No track selected yet.</Text>
          ) : null}
          <TextInput
            style={styles.commentInput}
            value={draft.comment}
            onChangeText={(comment) => updateComment(index, comment)}
            placeholder="Add optional comment for this track..."
            placeholderTextColor={THEME.faint}
            multiline
            textAlignVertical="top"
          />
        </View>
      ))}

      <Text style={styles.mutedHint}>
        Pick both tracks, add any notes you want, then save. Due{" "}
        {formatDeadline(round.submission_deadline_at)}
      </Text>

      <ThemedButton
        label={mySubmissions.length > 0 ? "Save Changes" : "Submit Selections"}
        onPress={submitDrafts}
        disabled={!canSubmit}
        loading={submitting}
      />

      <ThemedButton label="Back" onPress={() => router.back()} variant="secondary" />
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
    playback.setPlaylist(orderedPlaylist);
    // setPlaylist is React state; play on the next tick.
    setTimeout(() => playback.playTrack(0), 0);
  };

  const onShuffle = () => {
    if (orderedPlaylist.length === 0) return;
    playback.setPlaylist(shuffled(orderedPlaylist));
    setTimeout(() => playback.playTrack(0), 0);
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

  const seasonName = round.seasons?.name ?? "";
  const subtitle = leagueName
    ? `${leagueName} · ${seasonName}`
    : seasonName;
  const meta = `Round ${round.round_number} · ${submissions.length} submission${
    submissions.length === 1 ? "" : "s"
  }`;

  return (
    <View>
      <HeroBanner
        imageKey={roundCoverKey(round)}
        videoKey={roundCoverKey(round)}
        title={round.prompt}
        subtitle={subtitle}
        meta={meta}
        ctas={{ play: onPlay, shuffle: onShuffle }}
        onBack={onBack}
      />

      <TrackList tracks={trackItems} />

      {/* ── Voters & comments ── */}
      {/* TODO: redesign in v2 — voter thread layout. */}
      {trackItems.length > 0 && (
        <View style={styles.votersSection}>
          <Text style={styles.sectionEyebrow}>VOTERS & COMMENTS</Text>
          {eligible.map((row) => {
            const voters = votersBySubmission[row.submission_id] ?? [];
            if (voters.length === 0) return null;
            return (
              <View key={row.submission_id} style={styles.voterGroup}>
                <Text style={styles.voterGroupTitle}>{row.track_title}</Text>
                <Text style={styles.voterGroupSub}>
                  {row.track_artist} · submitted by {row.display_name}
                </Text>
                <View style={styles.votersThread}>
                  {voters.map((entry, vi) => (
                    <View
                      key={entry.voter_user_id}
                      style={[styles.voterRow, vi > 0 && styles.voterRowBorder]}
                    >
                      <View style={styles.voterHeader}>
                        <Text style={styles.voterName}>{entry.voter_name}</Text>
                        <Text
                          style={[
                            styles.voterPoints,
                            entry.points === 0 && styles.voterPointsZero,
                          ]}
                        >
                          {entry.points > 0 ? `+${entry.points}` : "—"}
                        </Text>
                      </View>
                      {!!entry.comment && (
                        <Text style={styles.voterComment}>
                          &ldquo;{entry.comment}&rdquo;
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Forfeits — submitter didn't vote ── */}
      {/* TODO: redesign in v2 — forfeit section. */}
      {forfeits.length > 0 && (
        <View style={styles.forfeitSection}>
          <View style={styles.forfeitDividerRow}>
            <View style={styles.forfeitDividerLine} />
            <Text style={styles.forfeitDividerLabel}>
              FORFEITED ({forfeits.length})
            </Text>
            <View style={styles.forfeitDividerLine} />
          </View>
          <Text style={styles.forfeitHelp}>
            These players didn&apos;t vote, so points awarded to their tracks
            don&apos;t count toward the round or season total.
          </Text>
          {forfeits.map((row) => {
            const subComment = submissionCommentById[row.submission_id];
            return (
              <View key={row.submission_id} style={styles.forfeitItem}>
                <View style={styles.forfeitItemHead}>
                  <Text style={styles.forfeitItemName}>{row.display_name}</Text>
                  <Text style={styles.forfeitBadge}>DIDN&apos;T VOTE</Text>
                </View>
                <TrackRow
                  title={row.track_title}
                  artist={row.track_artist}
                  artwork={row.track_artwork_url}
                  compact
                />
                {!!subComment && (
                  <Text style={styles.submissionComment}>
                    &ldquo;{subComment}&rdquo;
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}
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

  // Results phase renders an edge-to-edge hero — skip PageHeader.
  if (phase === "results") {
    return (
      <View style={{ flex: 1, backgroundColor: THEME.bg }}>
        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1, backgroundColor: THEME.bg }}
          contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={THEME.accent}
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
      </View>
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
});
