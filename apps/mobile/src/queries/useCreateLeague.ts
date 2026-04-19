import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createLeague, type CreateLeagueArgs } from "@/services/leagues";
import { invalidations } from "./invalidation";

export function useCreateLeague() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: CreateLeagueArgs & { userId?: string }) =>
      createLeague(args),
    onSuccess: (_data, variables) => {
      invalidations.createLeague(qc, { userId: variables.userId });
    },
  });
}
