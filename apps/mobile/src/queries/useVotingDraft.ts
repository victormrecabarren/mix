// High-level voting facade for surfaces that vote on a single track at a time
// (the Now Playing modal). Composes the local-authoritative draft store with
// the round's budget rules, the viewer's eligibility, and the submit path.
//
// The voting screen edits the same underlying draft directly via
// `useVotingDraftStore`, so the two surfaces stay perfectly in sync.

import { useCallback, useMemo } from "react";
import { derivePhase } from "@/lib/utils/phase";
import { useVotingDraftStore } from "@/context/VotingDraftContext";
import { useRound } from "./useRound";
import { useRoundSubmissions } from "./useRoundSubmissions";
import { useMyVotes } from "./useMyVotes";
import { useSubmitVotes } from "./useSubmitVotes";
import type { VoteCommentInput, VoteInput } from "@/services/votes";

export function useVotingDraft(
  roundId: string | undefined,
  userId: string | undefined,
) {
  const { data: round } = useRound(roundId);
  const { data: submissions = [] } = useRoundSubmissions(roundId);
  const { data: myVotes = {} } = useMyVotes(roundId, userId);
  const store = useVotingDraftStore(roundId, userId);
  const submit = useSubmitVotes();

  const total = round?.seasons?.default_points_per_round ?? 10;
  const maxPerTrack = round?.seasons?.default_max_points_per_track ?? 5;
  const phase = round ? derivePhase(round) : null;
  const isVoting = phase === "voting";

  const didSubmit = !!userId && submissions.some((s) => s.user_id === userId);
  const alreadyVoted = Object.keys(myVotes).length > 0;
  // Editable only while voting is open, the viewer is a participant, hasn't
  // voted yet, and the draft has hydrated (avoids editing on top of empty
  // before the server draft loads).
  const canEdit = isVoting && didSubmit && !alreadyVoted && store.hydrated;

  const allocation = store.allocation;
  const used = useMemo(
    () => Object.values(allocation).reduce((a, b) => a + b, 0),
    [allocation],
  );
  const remaining = total - used;

  const adjust = useCallback(
    (subId: string, delta: number) => {
      if (!canEdit) return;
      store.setAllocation((prev) => {
        const cur = prev[subId] ?? 0;
        const next = Math.max(0, Math.min(maxPerTrack, cur + delta));
        const newUsed = used - cur + next;
        if (newUsed > total) return prev;
        return { ...prev, [subId]: next };
      });
    },
    [canEdit, maxPerTrack, used, total, store],
  );

  const setComment = useCallback(
    (subId: string, body: string) => {
      store.setComments((prev) => ({ ...prev, [subId]: body }));
    },
    [store],
  );

  // Points to display: committed votes once submitted (read-only), otherwise
  // the live draft.
  const points = useCallback(
    (subId: string) =>
      alreadyVoted ? myVotes[subId] ?? 0 : allocation[subId] ?? 0,
    [alreadyVoted, myVotes, allocation],
  );
  const comment = useCallback(
    (subId: string) => store.comments[subId] ?? "",
    [store.comments],
  );
  const isOwn = useCallback(
    (subId: string) =>
      submissions.some((s) => s.id === subId && s.user_id === userId),
    [submissions, userId],
  );

  const canSubmit = canEdit && remaining === 0 && !submit.isPending;

  const submitBallot = useCallback(async () => {
    if (!roundId || !userId) return;
    const votes: VoteInput[] = Object.entries(allocation)
      .filter(([, pts]) => pts > 0)
      .map(([submissionId, pts]) => ({ submissionId, points: pts }));
    const comments: VoteCommentInput[] = Object.entries(store.comments)
      .filter(([, body]) => body.trim().length > 0)
      .map(([submissionId, body]) => ({ submissionId, body }));
    // Kill the pending autosave first so it can't re-create the server draft
    // that submitVotes deletes. Local state is left intact (read-only) until
    // myVotes refetches.
    store.cancelSave();
    await submit.mutateAsync({ roundId, userId, votes, comments });
  }, [roundId, userId, allocation, store, submit]);

  return {
    round,
    phase,
    isVoting,
    didSubmit,
    alreadyVoted,
    canEdit,
    total,
    maxPerTrack,
    used,
    remaining,
    points,
    comment,
    adjust,
    setComment,
    isOwn,
    canSubmit,
    submitting: submit.isPending,
    saving: store.saving,
    dirty: store.dirty,
    hydrated: store.hydrated,
    submitBallot,
  };
}
