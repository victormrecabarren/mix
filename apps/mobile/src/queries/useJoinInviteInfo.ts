import { useQuery } from "@tanstack/react-query";
import { getJoinInviteInfo } from "@/services/invites";

export function useJoinInviteInfo(token: string | undefined) {
  return useQuery({
    queryKey: ["joinInvite", token ?? ""],
    queryFn: () => getJoinInviteInfo(token!),
    enabled: !!token,
  });
}
