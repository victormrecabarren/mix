import { useQuery } from "@tanstack/react-query";
import { getLeague } from "@/services/leagues";
import { queryKeys } from "./keys";

export function useLeague(leagueId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.leagueDetail(leagueId ?? ""),
    queryFn: () => getLeague(leagueId!),
    enabled: !!leagueId,
  });
}
