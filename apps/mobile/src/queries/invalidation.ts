import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";

// Mutation → cache effects. Edit this file when a UI surface needs different
// cache behavior. Hooks import from here so all invalidation logic lives in
// one place.

export const invalidations = {
  submitVotes: (qc: QueryClient, ctx: { roundId: string }) => {
    qc.invalidateQueries({ queryKey: queryKeys.round(ctx.roundId) });
  },
  submitRoundEntries: (qc: QueryClient, ctx: { roundId: string }) => {
    // A submit may auto-close the round, so refresh everything round-scoped.
    qc.invalidateQueries({ queryKey: queryKeys.round(ctx.roundId) });
  },
  updateSeason: (qc: QueryClient, ctx: { seasonId: string }) => {
    qc.invalidateQueries({ queryKey: queryKeys.season(ctx.seasonId) });
  },
  updateRound: (
    qc: QueryClient,
    ctx: { roundId: string; seasonId?: string },
  ) => {
    qc.invalidateQueries({ queryKey: queryKeys.round(ctx.roundId) });
    if (ctx.seasonId) {
      qc.invalidateQueries({ queryKey: queryKeys.season(ctx.seasonId) });
    }
  },
  createRound: (qc: QueryClient, ctx: { seasonId: string }) => {
    qc.invalidateQueries({ queryKey: queryKeys.season(ctx.seasonId) });
  },
  forceEndRound: (
    qc: QueryClient,
    ctx: { roundId: string; seasonId?: string },
  ) => {
    qc.invalidateQueries({ queryKey: queryKeys.round(ctx.roundId) });
    if (ctx.seasonId) {
      qc.invalidateQueries({ queryKey: queryKeys.season(ctx.seasonId) });
    }
  },
  createLeague: (qc: QueryClient, ctx: { userId?: string }) => {
    if (ctx.userId) {
      qc.invalidateQueries({ queryKey: queryKeys.userFirstLeague(ctx.userId) });
    }
  },
  createSeason: (qc: QueryClient, ctx: { leagueId: string }) => {
    qc.invalidateQueries({ queryKey: queryKeys.leagueSeasons(ctx.leagueId) });
    qc.invalidateQueries({
      queryKey: queryKeys.leagueActiveSeason(ctx.leagueId),
    });
  },
  joinLeague: (
    qc: QueryClient,
    ctx: { leagueId: string; userId: string },
  ) => {
    qc.invalidateQueries({ queryKey: queryKeys.leagueMembers(ctx.leagueId) });
    qc.invalidateQueries({
      queryKey: queryKeys.myRole(ctx.leagueId, ctx.userId),
    });
    qc.invalidateQueries({ queryKey: queryKeys.userFirstLeague(ctx.userId) });
  },
};
