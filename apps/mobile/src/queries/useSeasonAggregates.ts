import { useQuery } from "@tanstack/react-query";
import { getSeasonAggregates } from "@/services/standings";
import { queryKeys } from "./keys";

export function useSeasonAggregates(seasonId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.seasonAggregates(seasonId ?? ""),
    queryFn: () => getSeasonAggregates(seasonId!),
    enabled: !!seasonId,
  });
}
