import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";

// Mutation → cache effects. Edit this file when a UI surface needs different
// cache behavior. Hooks import from here so all invalidation logic lives in
// one place.

export const invalidations = {
  submitVotes: (qc: QueryClient, ctx: { roundId: string }) => {
    qc.invalidateQueries({ queryKey: queryKeys.round(ctx.roundId) });
    // The last vote can flip voting → results. That changes both the
    // home's active-round lookup (league prefix) AND the rounds list for
    // the active/completed seasons (season prefix — feeds the "Your
    // rounds" rail). We don't have leagueId/seasonId here, so nuke both
    // families.
    qc.invalidateQueries({ queryKey: ["league"] });
    qc.invalidateQueries({ queryKey: ["season"] });
  },
  submitRoundEntries: (qc: QueryClient, ctx: { roundId: string }) => {
    qc.invalidateQueries({ queryKey: queryKeys.round(ctx.roundId) });
    qc.invalidateQueries({
      predicate: (q) => {
        const key = q.queryKey as readonly unknown[];
        return key[0] === "submissionCounts" && key.includes(ctx.roundId);
      },
    });
    // Submitting the final allowed entry can auto-close submissions, which
    // moves the round into voting. Recompute the home's active-round
    // selection and the season rounds list.
    qc.invalidateQueries({ queryKey: ["league"] });
    qc.invalidateQueries({ queryKey: ["season"] });
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
    // Active-round selection on home is league-scoped; after a force-end
    // the home must swap to the next round (or the "up next" placeholder).
    // The "Your rounds" rail is season-scoped and needs the just-ended
    // round pushed into it.
    qc.invalidateQueries({ queryKey: ["league"] });
    qc.invalidateQueries({ queryKey: ["season"] });
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
