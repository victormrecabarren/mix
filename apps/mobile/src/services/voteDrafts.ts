import { supabase } from "@/lib/supabase";
import { postgresToMixError } from "./errors";

// In-progress (unsubmitted) ballot for a round, persisted server-side so a
// voter's allocation + comments survive an app kill. Two maps keyed by
// submission id. See migration 20260530000000_vote_drafts.sql.
export type VoteDraft = {
  allocation: Record<string, number>;
  comments: Record<string, string>;
};

export const EMPTY_VOTE_DRAFT: VoteDraft = { allocation: {}, comments: {} };

// `packages/db/types.ts` is stale and doesn't know about vote_drafts yet, so
// the typed client can't resolve the table. Cast through a minimal shape —
// same tech-debt workaround the rest of the services use (regenerate types
// with `pnpm gen-types` once the migration is applied).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export async function getVoteDraft(
  roundId: string,
  userId: string,
): Promise<VoteDraft> {
  const { data, error } = await sb
    .from("vote_drafts")
    .select("allocation, comments")
    .eq("round_id", roundId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw postgresToMixError(error);
  if (!data) return { allocation: {}, comments: {} };
  return {
    allocation: (data.allocation as Record<string, number>) ?? {},
    comments: (data.comments as Record<string, string>) ?? {},
  };
}

export async function saveVoteDraft(
  roundId: string,
  userId: string,
  draft: VoteDraft,
): Promise<void> {
  const { error } = await sb.from("vote_drafts").upsert(
    {
      round_id: roundId,
      user_id: userId,
      allocation: draft.allocation,
      comments: draft.comments,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "round_id,user_id" },
  );
  if (error) throw postgresToMixError(error);
}

export async function clearVoteDraft(
  roundId: string,
  userId: string,
): Promise<void> {
  const { error } = await sb
    .from("vote_drafts")
    .delete()
    .eq("round_id", roundId)
    .eq("user_id", userId);
  if (error) throw postgresToMixError(error);
}
