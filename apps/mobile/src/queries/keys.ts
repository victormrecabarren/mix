// Single source of truth for TanStack Query keys. Hierarchical so prefix
// invalidation (e.g. ['round', roundId]) nukes every round-scoped entry in
// one call.

export const queryKeys = {
  round: (roundId: string) => ["round", roundId] as const,
  roundSubmissions: (roundId: string) =>
    ["round", roundId, "submissions"] as const,
  myVotes: (roundId: string, userId: string) =>
    ["round", roundId, "myVotes", userId] as const,
};
