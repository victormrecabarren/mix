import { useQuery } from "@tanstack/react-query";
import { getActiveSeasonForLeague } from "@/services/seasons";
import { queryKeys } from "./keys";

export function useActiveSeasonForLeague(leagueId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.leagueActiveSeason(leagueId ?? ""),
    queryFn: () => getActiveSeasonForLeague(leagueId!),
    enabled: !!leagueId,
  });
}
