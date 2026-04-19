import { useQuery } from "@tanstack/react-query";
import { getRoundsForSeason } from "@/services/rounds";
import { queryKeys } from "./keys";

export function useRoundsForSeason(seasonId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.seasonRounds(seasonId ?? ""),
    queryFn: () => getRoundsForSeason(seasonId!),
    enabled: !!seasonId,
  });
}
