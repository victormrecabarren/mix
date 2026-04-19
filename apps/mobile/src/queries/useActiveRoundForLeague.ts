import { useQuery } from "@tanstack/react-query";
import { getActiveRoundForLeague } from "@/services/rounds";

export function useActiveRoundForLeague(leagueId: string | undefined) {
  return useQuery({
    queryKey: ["league", leagueId ?? "", "activeRound"] as const,
    queryFn: () => getActiveRoundForLeague(leagueId!),
    enabled: !!leagueId,
  });
}
