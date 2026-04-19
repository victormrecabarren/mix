import { useQuery } from "@tanstack/react-query";
import { getRoundVotersBySubmission } from "@/services/results";
import { queryKeys } from "./keys";

export function useRoundVoters(roundId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.roundVoters(roundId ?? ""),
    queryFn: () => getRoundVotersBySubmission(roundId!),
    enabled: !!roundId,
  });
}
