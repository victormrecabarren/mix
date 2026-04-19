import { useQuery } from "@tanstack/react-query";
import { getRoundSubmissions } from "@/services/votes";
import { queryKeys } from "./keys";

export function useRoundSubmissions(roundId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.roundSubmissions(roundId ?? ""),
    queryFn: () => getRoundSubmissions(roundId!),
    enabled: !!roundId,
  });
}
