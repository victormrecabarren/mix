import { useQuery } from "@tanstack/react-query";
import { getMyVotes } from "@/services/votes";
import { queryKeys } from "./keys";

export function useMyVotes(
  roundId: string | undefined,
  userId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.myVotes(roundId ?? "", userId ?? ""),
    queryFn: () => getMyVotes(roundId!, userId!),
    enabled: !!roundId && !!userId,
  });
}
