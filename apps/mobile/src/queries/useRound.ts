import { useQuery } from "@tanstack/react-query";
import { getRound } from "@/services/rounds";
import { queryKeys } from "./keys";

export function useRound(roundId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.roundDetail(roundId ?? ""),
    queryFn: () => getRound(roundId!),
    enabled: !!roundId,
  });
}
