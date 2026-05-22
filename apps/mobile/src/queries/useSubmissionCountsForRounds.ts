import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSubmissionCountsForRounds } from "@/services/submissions";
import { queryKeys } from "./keys";
import { useRoundsForSeason } from "./useRoundsForSeason";

// Batched: one query for the whole list of rounds. Cache key is stable across
// reorderings because the key factory sorts ids.
export function useSubmissionCountsForRounds(roundIds: string[]) {
  const sortedIds = useMemo(() => roundIds.slice().sort(), [roundIds]);
  return useQuery({
    queryKey: queryKeys.submissionCounts(sortedIds),
    queryFn: () => getSubmissionCountsForRounds(sortedIds),
    enabled: sortedIds.length > 0,
  });
}

// Convenience: pipes the season's rounds through the batched counts query.
// Returns the same shape as `useSubmissionCountsForRounds`.
export function useSubmissionCountsForSeason(seasonId: string | undefined) {
  const roundsQuery = useRoundsForSeason(seasonId);
  const roundIds = useMemo(
    () => (roundsQuery.data ?? []).map((r) => r.id),
    [roundsQuery.data],
  );
  return useSubmissionCountsForRounds(roundIds);
}
