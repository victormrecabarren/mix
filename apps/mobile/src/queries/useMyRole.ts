import { useQuery } from "@tanstack/react-query";
import { getMyRole } from "@/services/leagues";
import { queryKeys } from "./keys";

export function useMyRole(
  leagueId: string | undefined,
  userId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.myRole(leagueId ?? "", userId ?? ""),
    queryFn: () => getMyRole(leagueId!, userId!),
    enabled: !!leagueId && !!userId,
  });
}
