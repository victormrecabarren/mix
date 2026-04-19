import { useMutation, useQueryClient } from "@tanstack/react-query";
import { joinLeagueViaInvite } from "@/services/invites";
import { invalidations } from "./invalidation";

export function useJoinLeague() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      leagueId: string;
      userId: string;
      role: "participant" | "spectator";
    }) => joinLeagueViaInvite(args),
    onSuccess: (_data, variables) => {
      invalidations.joinLeague(qc, {
        leagueId: variables.leagueId,
        userId: variables.userId,
      });
    },
  });
}
