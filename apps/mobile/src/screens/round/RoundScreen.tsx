import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Image,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useRouter, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { getValidAccessToken } from "@/lib/spotifyAuth";

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

function parseSpotifyTrackId(input: string): string | null {
  const urlMatch = input.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  const uriMatch = input.match(/spotify:track:([a-zA-Z0-9]+)/);
  if (uriMatch) return uriMatch[1];
  return null;
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
  const [submitting, setSubmitting] = useState(false);
  const [drafts, setDrafts] = useState<DraftSubmission[]>([]);
  const searchRequestIds = useRef<Record<number, number>>({});

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
        const token = await getValidAccessToken();
        if (!token) throw new Error("Not logged in to Spotify");

        const linkedTrackId = parseSpotifyTrackId(trimmed);
        let nextResults: SpotifyTrack[] = [];

        if (linkedTrackId) {
          const res = await fetch(
            `https://api.spotify.com/v1/tracks/${linkedTrackId}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );
          if (!res.ok) throw new Error(`Spotify lookup failed (${res.status})`);
          const track = (await res.json()) as SpotifyTrack;
          nextResults = [track];
        } else {
          const res = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(trimmed)}&type=track&limit=8`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const data = (await res.json()) as {
            tracks?: { items: SpotifyTrack[] };
          };
          nextResults = data.tracks?.items ?? [];
        }

        if (searchRequestIds.current[slotIndex] !== requestId) return;
        setSearchState(slotIndex, {
          searchResults: nextResults,
          isSearching: false,
        });
      } catch (err) {
        if (searchRequestIds.current[slotIndex] !== requestId) return;
        setSearchState(slotIndex, { isSearching: false, searchResults: [] });
        Alert.alert(
          "Search failed",
          err instanceof Error ? err.message : "Unknown error",
        );
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

    setSubmitting(true);
    try {
      const updates = drafts
        .filter((draft) => draft.submissionId && draft.track)
        .map((draft) => {
          const track = draft.track as SpotifyTrack;
          return supabase
            .from("submissions")
            .update({
              spotify_track_id: track.id,
              track_title: track.name,
              track_artist: track.artists.map((a) => a.name).join(", "),
              track_artwork_url: track.album.images[0]?.url ?? null,
              track_isrc: track.external_ids?.isrc ?? "",
              track_album_name: track.album.name,
              track_duration_ms: track.duration_ms,
              track_popularity: track.popularity,
              comment: draft.comment.trim() || null,
            })
            .eq("id", draft.submissionId as string)
            .eq("user_id", userId);
        });

      const inserts = drafts
        .filter((draft) => !draft.submissionId && draft.track)
        .map((draft) => {
          const track = draft.track as SpotifyTrack;
          return {
            round_id: round.id,
            user_id: userId,
            spotify_track_id: track.id,
            track_title: track.name,
            track_artist: track.artists.map((a) => a.name).join(", "),
            track_artwork_url: track.album.images[0]?.url ?? null,
            track_isrc: track.external_ids?.isrc ?? "",
            track_album_name: track.album.name,
            track_duration_ms: track.duration_ms,
            track_popularity: track.popularity,
            comment: draft.comment.trim() || null,
          };
        });

      const updateResults = await Promise.all(updates);
      const updateError = updateResults.find(({ error }) => error)?.error;
      if (updateError) throw new Error(updateError.message);

      if (inserts.length > 0) {
        const { error } = await supabase.from("submissions").insert(inserts);
        if (error) throw new Error(error.message);
      }

      onSubmitted();
    } catch (err) {
      Alert.alert(
        "Submission failed",
        err instanceof Error ? err.message : "Unknown error",
      );
    } finally {
      setSubmitting(false);
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
        <Text style={styles.secondaryActionBtnText}>Back To Season</Text>
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
  onVoted,
}: {
  round: Round;
  userId: string;
  submissions: Submission[];
  myVotes: Record<string, number>;
  onVoted: () => void;
}) {
  const pointsTotal = round.seasons?.default_points_per_round ?? 10;
  const maxPerTrack = round.seasons?.default_max_points_per_track ?? 5;

  const [allocation, setAllocation] = useState<Record<string, number>>(() => myVotes);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const used = Object.values(allocation).reduce((a, b) => a + b, 0);
  const remaining = pointsTotal - used;
  const alreadyVoted = Object.keys(myVotes).length > 0;

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
    const entries = Object.entries(allocation).filter(([, pts]) => pts > 0);
    setSubmitting(true);
    try {
      // Submit votes via RPC — server validates total == default_points_per_round
      const votePayload = entries.map(([submission_id, points]) => ({ submission_id, points }));
      const { error: voteError } = await supabase.rpc('submit_votes', {
        p_round_id: round.id,
        p_voter_user_id: userId,
        p_votes: votePayload,
      });
      if (voteError) throw new Error(voteError.message);

      // Insert comments (any non-empty inputs, for any submission including own)
      const commentRows = submissions
        .filter((s) => (commentInputs[s.id] ?? '').trim().length > 0)
        .map((s) => ({
          round_id: round.id,
          submission_id: s.id,
          author_user_id: userId,
          body: commentInputs[s.id].trim(),
        }));
      if (commentRows.length > 0) {
        const { error: commentError } = await supabase.from('comments').insert(commentRows);
        if (commentError) throw new Error(commentError.message);
      }

      onVoted();
    } catch (err) {
      Alert.alert('Submit failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  if (alreadyVoted) {
    return (
      <View style={styles.phaseCard}>
        <View style={styles.votedBanner}>
          <Text style={styles.votedBannerText}>✓ Votes locked in</Text>
          <Text style={styles.votedBannerSub}>Results will show when voting closes.</Text>
        </View>
        {submissions.map((sub) => {
          const isOwn = sub.user_id === userId;
          const pts = myVotes[sub.id] ?? 0;
          return (
            <View key={sub.id} style={styles.submissionVoteCard}>
              <TrackRow title={sub.track_title} artist={sub.track_artist} artwork={sub.track_artwork_url} compact />
              {!!sub.comment && <Text style={styles.submissionComment}>"{sub.comment}"</Text>}
              {isOwn
                ? <Text style={styles.ownTrackLabel}>YOUR TRACK</Text>
                : pts > 0
                  ? <Text style={styles.lockedPts}>{pts} pt{pts !== 1 ? 's' : ''} given</Text>
                  : <Text style={styles.lockedPtsNone}>— no points</Text>}
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.phaseCard}>
      {/* Points budget */}
      <View style={styles.pointsBar}>
        <Text style={[styles.pointsRemaining, remaining === 0 && { color: '#1DB954' }]}>
          {remaining}
        </Text>
        <Text style={styles.mutedHint}> / {pointsTotal} pts remaining · max {maxPerTrack} per track</Text>
      </View>

      {submissions.map((sub) => {
        const isOwn = sub.user_id === userId;
        return (
          <View key={sub.id} style={styles.submissionVoteCard}>
            <TrackRow title={sub.track_title} artist={sub.track_artist} artwork={sub.track_artwork_url} compact />
            {!!sub.comment && <Text style={styles.submissionComment}>"{sub.comment}"</Text>}
            {isOwn ? (
              <Text style={styles.ownTrackLabel}>YOUR TRACK</Text>
            ) : (
              <View style={styles.voteStepper}>
                <TouchableOpacity style={styles.voteBtn} onPress={() => adjust(sub.id, -1)}>
                  <Text style={styles.voteBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.votePoints}>{allocation[sub.id] ?? 0}</Text>
                <TouchableOpacity style={styles.voteBtn} onPress={() => adjust(sub.id, 1)}>
                  <Text style={styles.voteBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            )}
            <TextInput
              style={styles.commentInputField}
              value={commentInputs[sub.id] ?? ''}
              onChangeText={(v) => setCommentInputs((prev) => ({ ...prev, [sub.id]: v }))}
              placeholder="Leave a comment… (optional)"
              placeholderTextColor="#444"
              multiline
            />
          </View>
        );
      })}

      <TouchableOpacity
        style={[styles.submitVoteBtn, (submitting || remaining > 0) && { opacity: 0.4 }]}
        onPress={submitVotes}
        disabled={submitting || remaining > 0}
      >
        {submitting
          ? <ActivityIndicator color="#000" />
          : <Text style={styles.submitVoteBtnText}>Submit Votes</Text>}
      </TouchableOpacity>
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

function ResultsPhase({ submissions, roundId }: { submissions: Submission[]; roundId: string }) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [votersBySubmission, setVotersBySubmission] = useState<Record<string, VoterEntry[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (submissions.length === 0) { setLoading(false); return; }
    const ids = submissions.map((s) => s.id);
    Promise.all([
      supabase
        .from('votes')
        .select('submission_id, points, voter_user_id, users(display_name)')
        .in('submission_id', ids),
      supabase
        .from('comments')
        .select('submission_id, body, author_user_id')
        .eq('round_id', roundId),
    ]).then(([{ data: voteData }, { data: commentData }]) => {
      // Build a lookup: submission_id → voter_user_id → comment body
      const commentLookup: Record<string, Record<string, string>> = {};
      (commentData ?? []).forEach((c) => {
        if (!commentLookup[c.submission_id]) commentLookup[c.submission_id] = {};
        commentLookup[c.submission_id][c.author_user_id] = c.body;
      });

      // Build totals and per-voter entries
      const totals: Record<string, number> = {};
      const voterMap: Record<string, VoterEntry[]> = {};

      (voteData ?? []).forEach((v) => {
        totals[v.submission_id] = (totals[v.submission_id] ?? 0) + v.points;
        if (!voterMap[v.submission_id]) voterMap[v.submission_id] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const name = (Array.isArray(v.users) ? (v.users[0] as any)?.display_name : (v.users as any)?.display_name) ?? 'Unknown';
        voterMap[v.submission_id].push({
          voter_user_id: v.voter_user_id,
          voter_name: name,
          points: v.points,
          comment: commentLookup[v.submission_id]?.[v.voter_user_id] ?? null,
        });
      });

      // Sort each submission's voters by points desc
      Object.values(voterMap).forEach((entries) =>
        entries.sort((a, b) => b.points - a.points),
      );

      setScores(totals);
      setVotersBySubmission(voterMap);
      setLoading(false);
    });
  }, [submissions, roundId]);

  if (loading) return <ActivityIndicator color="#555" style={{ marginTop: 24 }} />;

  const ranked = [...submissions].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
  const medalColor = ['#FFD700', '#C0C0C0', '#CD7F32'];

  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.phaseLabel}>RESULTS</Text>
      {ranked.length === 0 && <Text style={styles.mutedHint}>No submissions recorded.</Text>}
      {ranked.map((sub, i) => {
        const voters = votersBySubmission[sub.id] ?? [];
        const color = medalColor[i] ?? '#444';
        const pts = scores[sub.id] ?? 0;
        return (
          <View key={sub.id} style={[styles.resultItem, i < 3 && { borderColor: color + '44' }]}>
            {/* Rank column — top-aligned */}
            <View style={styles.rankCol}>
              <Text style={[styles.rank, { color }]}>#{i + 1}</Text>
            </View>

            {/* Main content */}
            <View style={styles.resultContent}>
              <TrackRow title={sub.track_title} artist={sub.track_artist} artwork={sub.track_artwork_url} compact />
              {!!sub.comment && <Text style={styles.submissionComment}>"{sub.comment}"</Text>}

              {voters.length > 0 && (
                <View style={styles.votersThread}>
                  {voters.map((entry, vi) => (
                    <View
                      key={entry.voter_user_id}
                      style={[styles.voterRow, vi > 0 && styles.voterRowBorder]}
                    >
                      <View style={styles.voterHeader}>
                        <Text style={styles.voterName}>{entry.voter_name}</Text>
                        <Text style={[styles.voterPoints, entry.points === 0 && styles.voterPointsZero]}>
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

            {/* Score — top-aligned */}
            <View style={styles.scoreCol}>
              <Text style={[styles.resultScore, { color }]}>{pts}</Text>
              <Text style={styles.resultScoreLabel}>pts</Text>
            </View>
          </View>
        );
      })}
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
  const [round, setRound] = useState<Round | null>(null);
  const [prevRound, setPrevRound] = useState<SiblingRound | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [myVotes, setMyVotes] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data: roundData } = await supabase
      .from("rounds")
      .select(
        "id, round_number, prompt, description, submission_deadline_at, voting_deadline_at, season_id, seasons(id, name, submissions_per_user, default_points_per_round, default_max_points_per_track, league_id)",
      )
      .eq("id", roundId)
      .single();

    if (!roundData) {
      setLoading(false);
      return;
    }

    const season = Array.isArray(roundData.seasons)
      ? roundData.seasons[0]
      : roundData.seasons;
    const r: Round = { ...roundData, seasons: season ?? null };
    setRound(r);

    // Check if current user is commissioner of this league
    if (season?.league_id && user) {
      const { data: leagueData } = await supabase
        .from("leagues")
        .select("admin_user_id")
        .eq("id", season.league_id)
        .single();
      setIsCommissioner(leagueData?.admin_user_id === user.id);
    }

    // Fetch previous round to determine if this one is open
    if (r.round_number > 1) {
      const { data: prev } = await supabase
        .from("rounds")
        .select("id, round_number, prompt, voting_deadline_at")
        .eq("season_id", r.season_id)
        .eq("round_number", r.round_number - 1)
        .single();
      setPrevRound(prev ?? null);
    } else {
      setPrevRound(null);
    }

    const [{ data: subData }, { data: voteData }] = await Promise.all([
      supabase
        .from("submissions")
        .select(
          "id, user_id, track_title, track_artist, track_artwork_url, spotify_track_id, track_isrc, comment",
        )
        .eq("round_id", roundId),
      supabase
        .from("votes")
        .select("submission_id, points")
        .eq("round_id", roundId)
        .eq("voter_user_id", user.id),
    ]);

    setSubmissions(subData ?? []);

    const voteMap: Record<string, number> = {};
    (voteData ?? []).forEach(({ submission_id, points }) => {
      voteMap[submission_id] = points;
    });
    setMyVotes(voteMap);

    setLoading(false);
  }, [roundId]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  if (loading) {
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

  const phase = getPhase(round, prevRound);
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
            fetchData();
          },
        },
      ],
    );
  };

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.root}
      style={{ backgroundColor: "#000" }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      enableOnAndroid
      extraScrollHeight={100}
    >
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
        <SubmissionPhase
          round={round}
          userId={userId}
          mySubmissions={mySubmissions}
          onSubmitted={fetchData}
        />
      )}

      {phase === "voting" && userId && (
        <VotingPhase
          round={round}
          userId={userId}
          submissions={submissions}
          myVotes={myVotes}
          onVoted={fetchData}
        />
      )}

      {phase === "voting" && isCommissioner && (
        <TouchableOpacity style={styles.forceCloseBtn} onPress={forceCloseVoting}>
          <Text style={styles.forceCloseBtnText}>Force End Voting</Text>
        </TouchableOpacity>
      )}

      {phase === "results" && <ResultsPhase submissions={submissions} roundId={round.id} />}
    </KeyboardAwareScrollView>
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
  lockedPts: { fontSize: 12, fontWeight: "700", color: "#1DB954" },
  lockedPtsNone: { fontSize: 12, color: "#333" },
  submitVoteBtn: {
    backgroundColor: "#1DB954",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  submitVoteBtnText: { color: "#000", fontSize: 15, fontWeight: "800" },

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
  voterComment: { fontSize: 12, color: '#888', fontStyle: 'italic', lineHeight: 17 },

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
