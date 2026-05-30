import { useQuery } from "@tanstack/react-query";
import { getSubmissionRoundId } from "@/services/submissions";
import { queryKeys } from "./keys";

// Resolves a submission id → its round id. A submission's round never changes,
// so the result is cached indefinitely. Returns null when the id isn't a
// submission (non-round playback source).
export function useSubmissionRoundId(submissionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.submissionRound(submissionId ?? ""),
    queryFn: () => getSubmissionRoundId(submissionId!),
    enabled: !!submissionId,
    staleTime: Infinity,
  });
}
