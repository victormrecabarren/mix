import { useMutation, useQueryClient } from "@tanstack/react-query";
import { commissionerExtendDeadline } from "@/services/deadlineExtensions";
import { invalidations } from "./invalidation";

export function useCommissionerExtendDeadline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: commissionerExtendDeadline,
    onSuccess: async (_data, variables) => {
      await invalidations.deadlineExtension(qc, {
        roundId: variables.roundId,
        deadlineType: variables.deadlineType,
      });
    },
  });
}
