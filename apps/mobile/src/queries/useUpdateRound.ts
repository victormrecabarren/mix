import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateRound, type RoundUpdate } from "@/services/commissioner";
import { invalidations } from "./invalidation";

export function useUpdateRound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      roundId: string;
      seasonId?: string;
      patch: RoundUpdate;
    }) => updateRound(args.roundId, args.patch),
    onSuccess: (_data, variables) => {
      invalidations.updateRound(qc, {
        roundId: variables.roundId,
        seasonId: variables.seasonId,
      });
    },
  });
}
