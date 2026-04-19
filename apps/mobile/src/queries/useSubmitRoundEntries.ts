import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  submitRoundEntries,
  type SubmitRoundEntriesArgs,
} from "@/services/submissions";
import { invalidations } from "./invalidation";

export function useSubmitRoundEntries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: SubmitRoundEntriesArgs) => submitRoundEntries(args),
    onSuccess: (_data, variables) => {
      invalidations.submitRoundEntries(qc, { roundId: variables.roundId });
    },
  });
}
