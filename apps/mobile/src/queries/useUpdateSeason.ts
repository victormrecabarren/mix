import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateSeason, type SeasonUpdate } from "@/services/commissioner";
import { invalidations } from "./invalidation";

export function useUpdateSeason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { seasonId: string; patch: SeasonUpdate }) =>
      updateSeason(args.seasonId, args.patch),
    onSuccess: (_data, variables) => {
      invalidations.updateSeason(qc, { seasonId: variables.seasonId });
    },
  });
}
