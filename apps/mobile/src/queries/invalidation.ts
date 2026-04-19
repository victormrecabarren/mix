import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";

// Mutation → cache effects. Edit this file when a UI surface needs different
// cache behavior. Hooks import from here so all invalidation logic lives in
// one place.

export const invalidations = {
  submitVotes: (qc: QueryClient, ctx: { roundId: string }) => {
    qc.invalidateQueries({ queryKey: queryKeys.round(ctx.roundId) });
  },
};
