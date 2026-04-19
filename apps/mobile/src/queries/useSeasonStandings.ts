import { useQuery } from "@tanstack/react-query";
import { getSeasonStandings } from "@/services/standings";
import { queryKeys } from "./keys";

export function useSeasonStandings(seasonId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.seasonStandings(seasonId ?? ""),
    queryFn: () => getSeasonStandings(seasonId!),
    enabled: !!seasonId,
  });
}
