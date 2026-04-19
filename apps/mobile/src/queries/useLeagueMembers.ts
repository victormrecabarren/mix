import { useQuery } from "@tanstack/react-query";
import { getLeagueMembers } from "@/services/leagues";
import { queryKeys } from "./keys";

export function useLeagueMembers(leagueId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.leagueMembers(leagueId ?? ""),
    queryFn: () => getLeagueMembers(leagueId!),
    enabled: !!leagueId,
  });
}
