import { useQuery } from "@tanstack/react-query";
import { getSeason } from "@/services/seasons";
import { queryKeys } from "./keys";

export function useSeason(seasonId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.seasonDetail(seasonId ?? ""),
    queryFn: () => getSeason(seasonId!),
    enabled: !!seasonId,
  });
}
