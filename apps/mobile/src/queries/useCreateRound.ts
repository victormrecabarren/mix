import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createRound, type CreateRoundArgs } from "@/services/commissioner";
import { invalidations } from "./invalidation";

export function useCreateRound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: CreateRoundArgs) => createRound(args),
    onSuccess: (_data, variables) => {
      invalidations.createRound(qc, { seasonId: variables.seasonId });
    },
  });
}
