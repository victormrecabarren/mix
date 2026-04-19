import { useQuery } from "@tanstack/react-query";
import { getRoundResults } from "@/services/results";
import { queryKeys } from "./keys";

export function useRoundResults(roundId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.roundResults(roundId ?? ""),
    queryFn: () => getRoundResults(roundId!),
    enabled: !!roundId,
  });
}
