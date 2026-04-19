// Single source of truth for TanStack Query keys. Hierarchical so prefix
// invalidation (e.g. ['round', roundId]) nukes every round-scoped entry in
// one call.

export const queryKeys = {
  // Round
  round: (roundId: string) => ["round", roundId] as const,
  roundDetail: (roundId: string) => ["round", roundId, "detail"] as const,
  roundSubmissions: (roundId: string) =>
    ["round", roundId, "submissions"] as const,
  myVotes: (roundId: string, userId: string) =>
    ["round", roundId, "myVotes", userId] as const,
  previousRound: (seasonId: string, roundNumber: number) =>
    ["season", seasonId, "prevRound", roundNumber] as const,

  // Season
  season: (seasonId: string) => ["season", seasonId] as const,
  seasonDetail: (seasonId: string) => ["season", seasonId, "detail"] as const,
  seasonRounds: (seasonId: string) => ["season", seasonId, "rounds"] as const,
  seasonRoundCount: (seasonId: string) =>
    ["season", seasonId, "roundCount"] as const,

  // League
  league: (leagueId: string) => ["league", leagueId] as const,
  leagueDetail: (leagueId: string) => ["league", leagueId, "detail"] as const,
  leagueSeasons: (leagueId: string) =>
    ["league", leagueId, "seasons"] as const,
  leagueMembers: (leagueId: string) =>
    ["league", leagueId, "members"] as const,
  leagueActiveSeason: (leagueId: string) =>
    ["league", leagueId, "activeSeason"] as const,
  myRole: (leagueId: string, userId: string) =>
    ["league", leagueId, "role", userId] as const,

  // User
  userFirstLeague: (userId: string) =>
    ["user", userId, "firstLeague"] as const,
};
