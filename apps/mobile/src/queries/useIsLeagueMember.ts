import { useQuery } from "@tanstack/react-query";
import { isLeagueMember } from "@/services/leagues";

export function useIsLeagueMember(
  leagueId: string | undefined,
  userId: string | undefined,
) {
  return useQuery({
    queryKey: ["league", leagueId ?? "", "isMember", userId ?? ""] as const,
    queryFn: () => isLeagueMember(leagueId!, userId!),
    enabled: !!leagueId && !!userId,
  });
}
