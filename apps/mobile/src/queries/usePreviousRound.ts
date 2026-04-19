import { useQuery } from "@tanstack/react-query";
import { getPreviousRound } from "@/services/rounds";
import { queryKeys } from "./keys";

export function usePreviousRound(
  seasonId: string | undefined,
  currentRoundNumber: number | undefined,
) {
  return useQuery({
    queryKey: queryKeys.previousRound(seasonId ?? "", currentRoundNumber ?? 0),
    queryFn: () => getPreviousRound(seasonId!, currentRoundNumber!),
    enabled: !!seasonId && !!currentRoundNumber && currentRoundNumber > 1,
  });
}
