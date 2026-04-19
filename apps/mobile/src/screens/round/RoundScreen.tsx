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
import { supabase } from "@/lib/supabase";
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
import { MixError } from "@/services/errors";
import type { VoteInput, VoteCommentInput } from "@/services/votes";
import type { SubmissionDraft } from "@/services/submissions";
import {
  searchSpotifyTracks,
  getSpotifyTrack,
  extractSpotifyTrackId,
} from "@/services/spotifySearch";

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

type Comment = {
  id: string;
  submission_id: string;
  body: string;
  author_user_id: string;
  author_name: string;
  created_at: string;
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

type Phase = "submissions" | "voting" | "results" | "upcoming";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPhase(round: Round, prevRound: SiblingRound | null): Phase {
  const now = Date.now();
  const sub = new Date(round.submission_deadline_at).getTime();
  const vote = new Date(round.voting_deadline_at).getTime();

  if (now >= vote) return "results";
  if (now >= sub) return "voting";

  // In submission window — previous round must be fully complete first
  if (prevRound && now < new Date(prevRound.voting_deadline_at).getTime()) {
    return "upcoming";
  }

  return "submissions";
}

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

// ─── Track row ────────────────────────────────────────────────────────────────

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
                      placeholderTextColor="#555"
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
                  <ActivityIndicator color="#888" size="small" />
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
            placeholderTextColor="#555"
            multiline
            textAlignVertical="top"
          />
        </View>
      ))}

      <Text style={styles.mutedHint}>
        Pick both tracks, add any notes you want, then save. Due{" "}
        {formatDeadline(round.submission_deadline_at)}
      </Text>

      <TouchableOpacity
        style={[styles.submitTrackBtn, !canSubmit && { opacity: 0.4 }]}
        onPress={submitDrafts}
        disabled={!canSubmit}
      >
        {submitting ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.submitTrackBtnText}>
            {mySubmissions.length > 0 ? "Save Changes" : "Submit Selections"}
          </Text>
        )}
      </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryActionBtn} onPress={() => router.back()}>
        <Text style={styles.secondaryActionBtnText}>Back</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Voting phase ─────────────────────────────────────────────────────────────

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

  // Freeze the submission order the first time we enter the submitted view,
  // so the list animates from its current order into the ranked order.
  const sortedSubmissions = useMemo(() => {
    if (!showSubmittedView) return submissions;
    return [...submissions].sort((a, b) => {
      const aOwn = a.user_id === userId ? 1 : 0;
      const bOwn = b.user_id === userId ? 1 : 0;
      if (aOwn !== bOwn) return aOwn - bOwn; // own track to bottom
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
          <Text style={styles.spectatorCardTitle}>You're spectating</Text>
          <Text style={styles.spectatorCardBody}>
            Sit back — participants are voting on their submissions. Results will show when voting closes.
          </Text>
        </View>
        {submissions.map((sub) => (
          <View key={sub.id} style={[styles.submissionVoteCard, { opacity: 0.4 }]}>
            <TrackRow title={sub.track_title} artist={sub.track_artist} artwork={sub.track_artwork_url} compact />
            {!!sub.comment && <Text style={styles.submissionComment}>"{sub.comment}"</Text>}
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
            You didn't submit a track before the deadline. You can see the submissions but can't vote.
          </Text>
        </View>
        {submissions.map((sub) => (
          <View key={sub.id} style={[styles.submissionVoteCard, { opacity: 0.45 }]}>
            <TrackRow title={sub.track_title} artist={sub.track_artist} artwork={sub.track_artwork_url} compact />
            {!!sub.comment && <Text style={styles.submissionComment}>"{sub.comment}"</Text>}
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
          <Text style={[styles.pointsRemaining, remaining === 0 && { color: '#1DB954' }]}>
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
            {!!sub.comment && <Text style={styles.submissionComment}>"{sub.comment}"</Text>}

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
                placeholderTextColor="#444"
                multiline
              />
            )}
          </View>
        );
      })}

      {!showSubmittedView && (
        <TouchableOpacity
          style={[styles.submitVoteBtn, (submitting || remaining > 0) && { opacity: 0.4 }]}
          onPress={submitVotes}
          disabled={submitting || remaining > 0}
        >
          {submitting
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.submitVoteBtnText}>Submit Votes</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Results phase ────────────────────────────────────────────────────────────

type VoterEntry = {
  voter_user_id: string;
  voter_name: string;
  points: number;
  comment: string | null;
};

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];
const PLACE_LABELS = ['1ST', '2ND', '3RD'];

function SubmitterBadge({ name, color, size = 22 }: { name: string; color?: string; size?: number }) {
  return (
    <View style={styles.submitterBadge}>
      <View
        style={[
          styles.submitterAvatar,
          { width: size, height: size, borderRadius: size / 2 },
          color ? { backgroundColor: color + '33', borderColor: color + '88' } : null,
        ]}
      >
        <Text style={[styles.submitterAvatarText, { fontSize: size * 0.42 }, color ? { color } : null]}>
          {name[0]?.toUpperCase() ?? '?'}
        </Text>
      </View>
      <Text style={[styles.submitterName, color ? { color } : null]} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

function PodiumColumn({
  rank,
  submitterName,
  points,
}: {
  rank: number;
  submitterName: string;
  points: number;
}) {
  const color = MEDAL_COLORS[rank];
  const isWinner = rank === 0;
  const avatarSize = isWinner ? 56 : 44;
  return (
    <View style={[styles.podiumCol, isWinner && styles.podiumColWinner]}>
      <View
        style={[
          styles.podiumAvatar,
          {
            width: avatarSize,
            height: avatarSize,
            borderRadius: avatarSize / 2,
            borderColor: color,
            backgroundColor: color + '22',
          },
        ]}
      >
        <Text style={[styles.podiumAvatarText, { color, fontSize: avatarSize * 0.4 }]}>
          {submitterName[0]?.toUpperCase() ?? '?'}
        </Text>
      </View>
      <Text style={[styles.podiumPlace, { color }]}>{PLACE_LABELS[rank]}</Text>
      <Text style={styles.podiumColName} numberOfLines={1}>{submitterName}</Text>
      <View style={styles.podiumScoreRow}>
        <Text style={[styles.podiumScore, { color }, isWinner && { fontSize: 22 }]}>{points}</Text>
        <Text style={styles.podiumScoreLabel}>pts</Text>
      </View>
    </View>
  );
}

type RoundResultRow = {
  submission_id: string;
  user_id: string;
  display_name: string;
  track_title: string;
  track_artist: string;
  track_artwork_url: string | null;
  spotify_track_id: string | null;
  track_isrc: string;
  points_raw: number;
  points_effective: number;
  is_void: boolean;
};

function ResultsPhase({ submissions, roundId }: { submissions: Submission[]; roundId: string }) {
  const resultsQuery = useRoundResults(roundId);
  const votersQuery = useRoundVoters(roundId);
  const results = resultsQuery.data ?? [];
  const votersBySubmission = votersQuery.data ?? {};
  const loading = resultsQuery.isPending || votersQuery.isPending;
  const loadError =
    resultsQuery.error instanceof Error ? resultsQuery.error.message : null;

  const submissionCommentById = useMemo(() => {
    const map: Record<string, string | null> = {};
    submissions.forEach((s) => { map[s.id] = s.comment; });
    return map;
  }, [submissions]);

  // Sort defensively so ranking never depends on RPC row order.
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

  if (loading) return <ActivityIndicator color="#555" style={{ marginTop: 24 }} />;

  if (loadError) {
    return (
      <View style={{ gap: 10 }}>
        <Text style={styles.phaseLabel}>RESULTS</Text>
        <Text style={styles.mutedHint}>{loadError}</Text>
      </View>
    );
  }

  if (results.length === 0) {
    return (
      <View style={{ gap: 10 }}>
        <Text style={styles.phaseLabel}>RESULTS</Text>
        <Text style={styles.mutedHint}>No submissions recorded.</Text>
      </View>
    );
  }

  const podium = eligible.slice(0, 3);
  const winnerName = podium[0]?.display_name ?? null;

  return (
    <View style={{ gap: 14 }}>
      {/* Congratulatory header */}
      <View style={styles.resultsHero}>
        <Text style={styles.resultsHeroEyebrow}>ROUND COMPLETE</Text>
        <Text style={styles.resultsHeroTitle}>
          {winnerName ? `Congrats, ${winnerName}!` : 'No winner this round'}
        </Text>
        <Text style={styles.resultsHeroSub}>
          {eligible.length === 0
            ? 'Everyone forfeited — no eligible entries.'
            : eligible.length === 1
              ? 'Only one eligible entry — an easy win.'
              : "Here's how the round landed."}
        </Text>
      </View>

      {/* Podium — classic 2-1-3 horizontal layout (forfeits excluded) */}
      {podium.length > 0 && (
        <View style={styles.podiumRow}>
          {podium[1] && (
            <PodiumColumn
              rank={1}
              submitterName={podium[1].display_name}
              points={podium[1].points_effective}
            />
          )}
          {podium[0] && (
            <PodiumColumn
              rank={0}
              submitterName={podium[0].display_name}
              points={podium[0].points_effective}
            />
          )}
          {podium[2] && (
            <PodiumColumn
              rank={2}
              submitterName={podium[2].display_name}
              points={podium[2].points_effective}
            />
          )}
        </View>
      )}

      {/* Full ranked list — eligible ranks 1..N, then forfeits */}
      <Text style={styles.phaseLabel}>ALL ENTRIES</Text>
      {eligible.map((row, i) => {
        const voters = votersBySubmission[row.submission_id] ?? [];
        const color = MEDAL_COLORS[i] ?? '#444';
        const subComment = submissionCommentById[row.submission_id];
        return (
          <View
            key={row.submission_id}
            style={[styles.resultItem, i < 3 && { borderColor: color + '44' }]}
          >
            <View style={styles.rankCol}>
              <Text style={[styles.rank, { color }]}>#{i + 1}</Text>
            </View>

            <View style={styles.resultContent}>
              <SubmitterBadge name={row.display_name} color={i < 3 ? color : undefined} />
              <TrackRow
                title={row.track_title}
                artist={row.track_artist}
                artwork={row.track_artwork_url}
                compact
              />
              {!!subComment && <Text style={styles.submissionComment}>"{subComment}"</Text>}

              {voters.length > 0 && (
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
                          {entry.points > 0 ? `+${entry.points}` : '—'}
                        </Text>
                      </View>
                      {!!entry.comment && (
                        <Text style={styles.voterComment}>"{entry.comment}"</Text>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.scoreCol}>
              <Text style={[styles.resultScore, { color }]}>{row.points_effective}</Text>
              <Text style={styles.resultScoreLabel}>pts</Text>
            </View>
          </View>
        );
      })}

      {/* Forfeits — submitter didn't vote, so their points don't count */}
      {forfeits.length > 0 && (
        <>
          <View style={styles.forfeitDividerRow}>
            <View style={styles.forfeitDividerLine} />
            <Text style={styles.forfeitDividerLabel}>FORFEITED ({forfeits.length})</Text>
            <View style={styles.forfeitDividerLine} />
          </View>
          <Text style={styles.forfeitHelp}>
            These players didn't vote, so points awarded to their tracks don't count toward the round or season total.
          </Text>
          {forfeits.map((row) => {
            const voters = votersBySubmission[row.submission_id] ?? [];
            const subComment = submissionCommentById[row.submission_id];
            return (
              <View key={row.submission_id} style={[styles.resultItem, styles.resultItemForfeit]}>
                <View style={styles.rankCol}>
                  <Text style={styles.rankForfeit}>—</Text>
                </View>

                <View style={styles.resultContent}>
                  <View style={styles.forfeitHeaderRow}>
                    <SubmitterBadge name={row.display_name} />
                    <Text style={styles.forfeitBadge}>DIDN'T VOTE</Text>
                  </View>
                  <TrackRow
                    title={row.track_title}
                    artist={row.track_artist}
                    artwork={row.track_artwork_url}
                    compact
                  />
                  {!!subComment && <Text style={styles.submissionComment}>"{subComment}"</Text>}

                  {voters.length > 0 && (
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
                                styles.voterPointsVoid,
                              ]}
                            >
                              {entry.points > 0 ? `+${entry.points}` : '—'}
                            </Text>
                          </View>
                          {!!entry.comment && (
                            <Text style={styles.voterComment}>"{entry.comment}"</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                <View style={styles.scoreCol}>
                  <Text style={[styles.resultScore, styles.resultScoreVoid]}>
                    {row.points_raw}
                  </Text>
                  <Text style={styles.resultScoreLabel}>pts</Text>
                </View>
              </View>
            );
          })}
        </>
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
  const router = useRouter();
  const { supabaseUserId } = useSession();
  const userId = supabaseUserId;

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

  if (roundLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#555" />
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

  const phase = getPhase(round, prevRound ?? null);
  const mySubmissions = submissions.filter((s) => s.user_id === userId);

  const phaseColor: Record<Phase, string> = {
    submissions: "#1DB954",
    voting: "#f0a500",
    results: "#555",
    upcoming: "#333",
  };
  const phaseLabel: Record<Phase, string> = {
    submissions: "SUBMISSIONS OPEN",
    voting: "VOTING OPEN",
    results: "COMPLETED",
    upcoming: "NOT STARTED YET",
  };

  const forceCloseVoting = async () => {
    Alert.alert(
      "Force end voting?",
      "This will immediately close the voting window and move the round to results.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End Voting",
          style: "destructive",
          onPress: async () => {
            await supabase
              .from("rounds")
              .update({ voting_deadline_at: new Date().toISOString() })
              .eq("id", round.id);
            refetchRound();
          },
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#000" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={88}
    >
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.root}
        style={{ flex: 1, backgroundColor: "#000" }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1DB954" />}
      >
      {phase === 'results' &&
        round.seasons?.status === 'completed' &&
        round.round_number === totalRounds && (
        <TouchableOpacity
          style={styles.seasonCompleteBanner}
          onPress={() => router.push({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pathname: '/(tabs)/(home)/season/[id]' as any,
            params: { id: round.season_id, initialTab: 'standings' },
          })}
          activeOpacity={0.8}
        >
          <Text style={styles.seasonCompleteEmoji}>🏆</Text>
          <View style={styles.seasonCompleteText}>
            <Text style={styles.seasonCompleteTitle}>Season complete!</Text>
            <Text style={styles.seasonCompleteSub}>See the final standings →</Text>
          </View>
        </TouchableOpacity>
      )}

      <View style={styles.roundMeta}>
        <Text style={styles.roundTitle}>{round.prompt}</Text>
        <Text style={[styles.phaseBadge, { color: phaseColor[phase] }]}>
          {phaseLabel[phase]}
        </Text>
      </View>

      <View style={styles.promptCard}>
        <Text style={styles.promptLabel}>DESCRIPTION</Text>
        <Text style={styles.promptText}>
          {round.description || "No description provided."}
        </Text>
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
            Opens when "{prevRound.prompt}" closes on{" "}
            {formatDeadline(prevRound.voting_deadline_at)}
          </Text>
        </View>
      )}

      {phase === "submissions" && userId && (
        myRole === 'spectator' ? (
          <View style={styles.spectatorPlaylistCard}>
            <Text style={styles.spectatorPlaylistEmoji}>🎵</Text>
            <Text style={styles.spectatorPlaylistTitle}>A playlist is forming</Text>
            <Text style={styles.spectatorPlaylistBody}>
              Participants are locking in their picks for "{round.prompt}". You'll be able to listen once submissions close.
            </Text>
          </View>
        ) : (
          <SubmissionPhase
            round={round}
            userId={userId}
            mySubmissions={mySubmissions}
            onSubmitted={() => router.back()}
          />
        )
      )}

      {phase === "voting" && userId && (
        <VotingPhase
          round={round}
          userId={userId}
          submissions={submissions}
          myVotes={myVotes}
          didSubmit={mySubmissions.length > 0}
          isSpectator={myRole === 'spectator'}
          onVoted={refetchRound}
          onScrollToTop={scrollToTop}
        />
      )}

      {phase === "voting" && isCommissioner && (
        <TouchableOpacity style={styles.forceCloseBtn} onPress={forceCloseVoting}>
          <Text style={styles.forceCloseBtnText}>Force End Voting</Text>
        </TouchableOpacity>
      )}

      {phase === "results" && <ResultsPhase submissions={submissions} roundId={round.id} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  root: {
    backgroundColor: "#000",
    padding: 24,
    paddingBottom: 64,
    gap: 20,
  },

  roundMeta: { gap: 4 },
  roundTitle: { fontSize: 28, fontWeight: "800", color: "#fff" },
  phaseBadge: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },

  promptCard: {
    backgroundColor: "#111",
    borderRadius: 12,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: "#222",
  },
  promptLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#555",
    letterSpacing: 1,
  },
  promptText: {
    fontSize: 17,
    color: "#fff",
    fontWeight: "600",
    lineHeight: 24,
  },

  deadlines: { gap: 4 },
  deadlineItem: { fontSize: 12, color: "#555" },
  deadlineValue: { color: "#888" },

  upcomingCard: {
    backgroundColor: "#111",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#222",
  },
  upcomingText: { fontSize: 13, color: "#555", lineHeight: 18 },

  // Phase card
  phaseCard: {
    backgroundColor: "#0d0d0d",
    borderRadius: 14,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: "#1a1a1a",
  },
  phaseLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#555",
    letterSpacing: 1,
  },
  mutedHint: { fontSize: 12, color: "#444" },

  // Points
  pointsBar: { flexDirection: "row", alignItems: "baseline" },
  pointsRemaining: { fontSize: 22, fontWeight: "800", color: "#fff" },

  // Search / link
  searchInput: {
    flex: 1,
    backgroundColor: "#111",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  searchLoadingRow: {
    paddingVertical: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  resultRow: { paddingTop: 8, paddingBottom: 4 },

  mySubmissionRow: {
    backgroundColor: "#111",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
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
  clearSlotText: { fontSize: 12, color: "#888", fontWeight: "600" },
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
    fontSize: 22,
    color: "#666",
    fontWeight: "700",
  },
  editTrackMeta: { flex: 1 },
  inlineInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0a0a0a",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#222",
    paddingLeft: 12,
    paddingRight: 8,
  },
  inlineSearchInput: {
    flex: 1,
    minHeight: 48,
    color: "#fff",
    fontSize: 14,
    paddingVertical: 10,
  },
  cancelEditBtn: { paddingHorizontal: 8, paddingVertical: 8 },
  cancelEditText: { color: "#888", fontSize: 13, fontWeight: "700" },
  commentInput: {
    marginTop: 10,
    minHeight: 68,
    backgroundColor: "#0a0a0a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#222",
    padding: 10,
    color: "#fff",
    fontSize: 13,
  },
  submitTrackBtn: {
    backgroundColor: "#1DB954",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  submitTrackBtnText: { color: "#000", fontWeight: "700", fontSize: 14 },
  secondaryActionBtn: {
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    backgroundColor: "transparent",
  },
  secondaryActionBtnText: {
    color: "#ddd",
    fontWeight: "700",
    fontSize: 14,
  },

  // Track row
  trackRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  artwork: { backgroundColor: "#222" },
  artworkPlaceholder: { backgroundColor: "#222" },
  trackMeta: { flex: 1, gap: 2 },
  trackTitle: { fontSize: 15, fontWeight: "600", color: "#fff" },
  trackArtist: { fontSize: 12, color: "#888" },

  // Voting — unified submission card
  submissionVoteCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  submissionVoteCardVoted: {
    borderColor: '#1DB95466',
    backgroundColor: '#0f1a12',
  },
  submissionVoteCardUnvoted: {
    borderColor: 'transparent',
    backgroundColor: '#0a0a0a',
    opacity: 0.55,
  },
  ownTrackLabel: { fontSize: 10, fontWeight: '800', color: '#1DB954', letterSpacing: 1 },
  voteStepper: { flexDirection: "row", alignItems: "center", gap: 6 },
  voteBtn: {
    width: 32,
    height: 32,
    backgroundColor: "#222",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  voteBtnDisabled: { opacity: 0.25 },
  voteBtnText: { color: "#fff", fontSize: 18, fontWeight: "300" },
  votePoints: {
    width: 28,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  votedBanner: {
    backgroundColor: "#0a1f10",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#1DB95433",
  },
  votedBannerText: { color: "#1DB954", fontSize: 13, fontWeight: "700" },
  votedBannerSub: { color: "#1DB95499", fontSize: 11 },
  spectatorCard: {
    backgroundColor: '#0d0d1a',
    borderRadius: 8,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: '#9b59b633',
  },
  spectatorCardTitle: { color: '#9b59b6', fontSize: 13, fontWeight: '700' },
  spectatorCardBody: { color: '#9b59b699', fontSize: 12, lineHeight: 17 },
  spectatorPlaylistCard: {
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0d0d1a',
    borderWidth: 1,
    borderColor: '#9b59b633',
  },
  spectatorPlaylistEmoji: { fontSize: 48 },
  spectatorPlaylistTitle: { fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'center' },
  spectatorPlaylistBody: { fontSize: 13, color: '#888', lineHeight: 20, textAlign: 'center' },
  seasonCompleteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#1a1400',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FFD70044',
  },
  seasonCompleteEmoji: { fontSize: 36 },
  seasonCompleteText: { flex: 1, gap: 3 },
  seasonCompleteTitle: { fontSize: 16, fontWeight: '800', color: '#FFD700' },
  seasonCompleteSub: { fontSize: 12, color: '#FFD70099' },
  ineligibleBanner: {
    backgroundColor: '#1a0a00',
    borderRadius: 8,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: '#f0a50033',
  },
  ineligibleTitle: { color: '#f0a500', fontSize: 13, fontWeight: '700' },
  ineligibleSub: { color: '#f0a50099', fontSize: 11 },
  lockedPts: { fontSize: 12, fontWeight: "700", color: "#1DB954" },
  lockedPtsNone: { fontSize: 12, color: "#333" },
  submitVoteBtn: {
    backgroundColor: "#1DB954",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  submitVoteBtnText: { color: "#000", fontSize: 15, fontWeight: "800" },

  // Results hero
  resultsHero: {
    backgroundColor: '#0d0d0d',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#FFD70033',
    gap: 4,
    alignItems: 'center',
  },
  resultsHeroEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#FFD700',
  },
  resultsHeroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  resultsHeroSub: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
  },

  // Podium — horizontal 2-1-3 arrangement
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  podiumCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 6,
    backgroundColor: '#0d0d0d',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  podiumColWinner: {
    paddingVertical: 14,
    backgroundColor: '#14100a',
    borderColor: '#FFD70044',
  },
  podiumAvatar: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumAvatarText: {
    fontWeight: '800',
  },
  podiumPlace: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  podiumColName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ddd',
    maxWidth: '100%',
    textAlign: 'center',
  },
  podiumScoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  podiumScore: { fontSize: 18, fontWeight: '800' },
  podiumScoreLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#555',
    letterSpacing: 0.5,
  },

  // Submitter badge
  submitterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  submitterAvatar: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitterAvatarText: {
    color: '#fff',
    fontWeight: '800',
  },
  submitterName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ccc',
    maxWidth: 160,
  },

  // Results
  resultItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#0d0d0d",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1a1a1a",
  },
  rankCol: {
    width: 32,
    alignItems: "center",
    paddingTop: 2,
  },
  rank: { fontSize: 15, fontWeight: "800" },
  resultContent: { flex: 1, gap: 8 },
  scoreCol: {
    alignItems: "flex-end",
    paddingTop: 2,
    minWidth: 40,
  },
  resultScore: {
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 24,
  },
  resultScoreLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#555",
    letterSpacing: 0.5,
  },

  // Voter thread (results)
  votersThread: {
    gap: 0,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1e1e1e',
    marginTop: 4,
  },
  voterRow: {
    backgroundColor: '#111',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  voterRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#1e1e1e',
  },
  voterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  voterName: { fontSize: 12, fontWeight: '700', color: '#bbb' },
  voterPoints: { fontSize: 13, fontWeight: '800', color: '#1DB954' },
  voterPointsZero: { color: '#444' },
  voterPointsVoid: {
    color: '#555',
    textDecorationLine: 'line-through',
  },
  voterComment: { fontSize: 12, color: '#888', fontStyle: 'italic', lineHeight: 17 },

  // Forfeit styling (submitter didn't vote)
  forfeitDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  forfeitDividerLine: { flex: 1, height: 1, backgroundColor: '#1a1a1a' },
  forfeitDividerLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#555',
  },
  forfeitHelp: {
    fontSize: 11,
    color: '#666',
    lineHeight: 16,
    marginTop: -4,
    fontStyle: 'italic',
  },
  forfeitHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  forfeitBadge: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#888',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  resultItemForfeit: {
    opacity: 0.6,
    borderColor: '#1a1a1a',
    backgroundColor: '#0a0a0a',
  },
  rankForfeit: {
    fontSize: 15,
    fontWeight: '800',
    color: '#444',
  },
  resultScoreVoid: {
    color: '#555',
    textDecorationLine: 'line-through',
  },

  // Comment input (voting phase)
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  commentInputField: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#fff',
  },
  commentSendBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  commentSendText: { fontSize: 13, fontWeight: '700', color: '#1DB954' },
  submissionComment: {
    marginTop: 8,
    color: "#999",
    fontSize: 12,
    fontStyle: "italic",
    lineHeight: 17,
  },

  // Commissioner force-close
  forceCloseBtn: {
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#c0392b55",
    backgroundColor: "#1a0505",
  },
  forceCloseBtnText: { color: "#e74c3c", fontWeight: "700", fontSize: 13 },
});
