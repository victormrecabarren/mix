import { useMutation, useQueryClient } from "@tanstack/react-query";
import { submitVotes, type SubmitVotesArgs } from "@/services/votes";
import { invalidations } from "./invalidation";

export function useSubmitVotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: SubmitVotesArgs) => submitVotes(args),
    onSuccess: (_data, variables) => {
      invalidations.submitVotes(qc, { roundId: variables.roundId });
    },
  });
}
