import { useQuery } from "@tanstack/react-query";
import { getSeasonsForLeague } from "@/services/seasons";
import { queryKeys } from "./keys";

export function useSeasonsForLeague(leagueId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.leagueSeasons(leagueId ?? ""),
    queryFn: () => getSeasonsForLeague(leagueId!),
    enabled: !!leagueId,
  });
}
