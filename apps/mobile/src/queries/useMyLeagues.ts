import { useQuery } from "@tanstack/react-query";
import { getMyLeagues } from "@/services/users";

export function useMyLeagues(userId: string | undefined) {
  return useQuery({
    queryKey: ["user", userId ?? "", "leagues"] as const,
    queryFn: () => getMyLeagues(),
    enabled: !!userId,
  });
}
