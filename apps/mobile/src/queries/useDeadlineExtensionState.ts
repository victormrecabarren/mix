import { useQuery } from "@tanstack/react-query";
import {
  getDeadlineExtensionState,
  type DeadlineExtensionType,
} from "@/services/deadlineExtensions";
import { queryKeys } from "./keys";

export function useDeadlineExtensionState(
  roundId: string | undefined,
  deadlineType: DeadlineExtensionType | undefined,
  userId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.deadlineExtensionState(
      roundId ?? "",
      deadlineType ?? "submission",
      userId ?? "",
    ),
    queryFn: () => getDeadlineExtensionState(roundId!, deadlineType!, userId!),
    enabled: !!roundId && !!deadlineType && !!userId,
  });
}
