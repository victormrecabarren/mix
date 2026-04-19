import { useQuery } from "@tanstack/react-query";
import { getRoundCountForSeason } from "@/services/rounds";
import { queryKeys } from "./keys";

export function useRoundCountForSeason(seasonId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.seasonRoundCount(seasonId ?? ""),
    queryFn: () => getRoundCountForSeason(seasonId!),
    enabled: !!seasonId,
  });
}
