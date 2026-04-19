import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSeason, type CreateSeasonArgs } from "@/services/seasons";
import { invalidations } from "./invalidation";

export function useCreateSeason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: CreateSeasonArgs) => createSeason(args),
    onSuccess: (_data, variables) => {
      invalidations.createSeason(qc, { leagueId: variables.leagueId });
    },
  });
}
