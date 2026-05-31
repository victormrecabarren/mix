import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestDeadlineExtension } from "@/services/deadlineExtensions";
import { invalidations } from "./invalidation";

export function useRequestDeadlineExtension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: requestDeadlineExtension,
    onSuccess: async (_data, variables) => {
      await invalidations.deadlineExtension(qc, {
        roundId: variables.roundId,
        deadlineType: variables.deadlineType,
      });
    },
  });
}
