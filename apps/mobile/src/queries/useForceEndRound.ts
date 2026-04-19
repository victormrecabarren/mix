import { useMutation, useQueryClient } from "@tanstack/react-query";
import { forceEndRound } from "@/services/commissioner";
import { invalidations } from "./invalidation";

export function useForceEndRound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { roundId: string; seasonId?: string }) =>
      forceEndRound(args.roundId),
    onSuccess: (_data, variables) => {
      invalidations.forceEndRound(qc, {
        roundId: variables.roundId,
        seasonId: variables.seasonId,
      });
    },
  });
}
