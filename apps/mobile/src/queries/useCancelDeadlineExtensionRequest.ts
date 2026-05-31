import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cancelDeadlineExtensionRequest } from "@/services/deadlineExtensions";
import { invalidations } from "./invalidation";

export function useCancelDeadlineExtensionRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cancelDeadlineExtensionRequest,
    onSuccess: async (_data, variables) => {
      await invalidations.deadlineExtension(qc, {
        roundId: variables.roundId,
        deadlineType: variables.deadlineType,
      });
    },
  });
}
