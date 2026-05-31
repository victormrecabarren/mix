import { supabase } from "@/lib/supabase";
import { postgresToMixError } from "./errors";

export type DeadlineExtensionType = "submission" | "voting";

export type DeadlineExtensionState = {
  roundId: string;
  deadlineType: DeadlineExtensionType;
  enabled: boolean;
  thresholdPercent: number;
  durationMinutes: number;
  maxExtensionsPerPhase: number | null;
  eligibleCount: number;
  requestedCount: number;
  thresholdCount: number;
  userRequested: boolean;
  extensionCount: number;
  extensionLimitReached: boolean;
  closesWithinExtensionWindow: boolean;
  extensionAllowed: boolean;
  lastOutcome: "extended" | "blocked" | null;
  lastReason: string | null;
  lastNewDeadline: string | null;
};

type RoundExtensionConfigRow = {
  id: string;
  season_id: string;
  round_number: number;
  submission_deadline_at: string;
  voting_deadline_at: string;
  seasons:
    | {
        league_id: string;
        deadline_extension_enabled: boolean | null;
        deadline_extension_threshold_percent: number | null;
        deadline_extension_duration_minutes: number | null;
        deadline_extension_max_per_phase: number | null;
      }
    | Array<{
        league_id: string;
        deadline_extension_enabled: boolean | null;
        deadline_extension_threshold_percent: number | null;
        deadline_extension_duration_minutes: number | null;
        deadline_extension_max_per_phase: number | null;
      }>
    | null;
};

type ExtensionLogRow = {
  outcome: "extended" | "blocked";
  reason: string | null;
  new_deadline: string | null;
};

function normalizeSeason(row: RoundExtensionConfigRow) {
  return Array.isArray(row.seasons) ? row.seasons[0] : row.seasons;
}

function thresholdCount(
  eligibleCount: number,
  thresholdPercent: number,
): number {
  if (eligibleCount <= 0) return 0;
  return Math.max(1, Math.ceil((eligibleCount * thresholdPercent) / 100));
}

export async function getDeadlineExtensionState(
  roundId: string,
  deadlineType: DeadlineExtensionType,
  userId: string,
): Promise<DeadlineExtensionState | null> {
  const { data: roundData, error: roundError } = await supabase
    .from("rounds")
    .select(
      "id, season_id, round_number, submission_deadline_at, voting_deadline_at, seasons(league_id, deadline_extension_enabled, deadline_extension_threshold_percent, deadline_extension_duration_minutes, deadline_extension_max_per_phase)" as string,
    )
    .eq("id", roundId)
    .single();
  if (roundError) {
    if (roundError.code === "PGRST116") return null;
    throw postgresToMixError(roundError);
  }

  const round = roundData as unknown as RoundExtensionConfigRow;
  const season = normalizeSeason(round);
  if (!season) return null;

  let nextSubmissionDeadline: string | null = null;
  if (deadlineType === "voting") {
    const { data: nextRound, error: nextRoundError } = await supabase
      .from("rounds")
      .select("submission_deadline_at")
      .eq("season_id", round.season_id)
      .eq("round_number", round.round_number + 1)
      .maybeSingle();
    if (nextRoundError) throw postgresToMixError(nextRoundError);
    nextSubmissionDeadline = nextRound?.submission_deadline_at ?? null;
  }

  const [eligibleResult, requestsResult, logsResult] = await Promise.all([
    supabase
      .from("league_members")
      .select("user_id", { count: "exact" })
      .eq("league_id", season.league_id)
      .eq("role", "participant"),
    supabase
      .from("deadline_extension_requests")
      .select("user_id")
      .eq("round_id", roundId)
      .eq("deadline_type", deadlineType),
    supabase
      .from("deadline_extension_log")
      .select("outcome, reason, new_deadline")
      .eq("round_id", roundId)
      .eq("deadline_type", deadlineType)
      .order("triggered_at", { ascending: false }),
  ]);

  if (eligibleResult.error) throw postgresToMixError(eligibleResult.error);
  if (requestsResult.error) throw postgresToMixError(requestsResult.error);
  if (logsResult.error) throw postgresToMixError(logsResult.error);

  const eligibleCount =
    eligibleResult.count ?? eligibleResult.data?.length ?? 0;
  const requests = requestsResult.data ?? [];
  const logs = (logsResult.data ?? []) as unknown as ExtensionLogRow[];
  const percent = season.deadline_extension_threshold_percent ?? 33;
  const durationMinutes = season.deadline_extension_duration_minutes ?? 1440;
  const maxExtensions = season.deadline_extension_max_per_phase ?? null;
  const extensionCount = logs.filter(
    (log) => log.outcome === "extended",
  ).length;
  const lastLog = logs[0];
  const activeDeadline =
    deadlineType === "submission"
      ? round.submission_deadline_at
      : round.voting_deadline_at;
  const capDeadline =
    deadlineType === "submission"
      ? round.voting_deadline_at
      : nextSubmissionDeadline;
  const activeDeadlineMs = new Date(activeDeadline).getTime();
  const durationMs = durationMinutes * 60_000;
  const nowMs = Date.now();
  const capDeadlineMs = capDeadline ? new Date(capDeadline).getTime() : null;
  const extensionDeadlineMs = activeDeadlineMs + durationMs;
  const closesWithinExtensionWindow =
    activeDeadlineMs > nowMs && activeDeadlineMs - nowMs < durationMs;
  const extensionAllowed =
    activeDeadlineMs > nowMs &&
    (capDeadlineMs === null || extensionDeadlineMs <= capDeadlineMs);

  return {
    roundId,
    deadlineType,
    enabled: season.deadline_extension_enabled ?? true,
    thresholdPercent: percent,
    durationMinutes,
    maxExtensionsPerPhase: maxExtensions,
    eligibleCount,
    requestedCount: requests.length,
    thresholdCount: thresholdCount(eligibleCount, percent),
    userRequested: requests.some((request) => request.user_id === userId),
    extensionCount,
    extensionLimitReached:
      maxExtensions !== null && extensionCount >= maxExtensions,
    closesWithinExtensionWindow,
    extensionAllowed,
    lastOutcome: lastLog?.outcome ?? null,
    lastReason: lastLog?.reason ?? null,
    lastNewDeadline: lastLog?.new_deadline ?? null,
  };
}

export async function requestDeadlineExtension(args: {
  roundId: string;
  deadlineType: DeadlineExtensionType;
  userId: string;
}): Promise<void> {
  const { error } = await (supabase.rpc as any)("request_deadline_extension", {
    p_round_id: args.roundId,
    p_deadline_type: args.deadlineType,
    p_user_id: args.userId,
  });
  if (error) throw postgresToMixError(error);
}

export async function cancelDeadlineExtensionRequest(args: {
  roundId: string;
  deadlineType: DeadlineExtensionType;
  userId: string;
}): Promise<void> {
  const { error } = await (supabase.rpc as any)(
    "cancel_deadline_extension_request",
    {
      p_round_id: args.roundId,
      p_deadline_type: args.deadlineType,
      p_user_id: args.userId,
    },
  );
  if (error) throw postgresToMixError(error);
}

export async function commissionerExtendDeadline(args: {
  roundId: string;
  deadlineType: DeadlineExtensionType;
}): Promise<void> {
  const { error } = await (supabase.rpc as any)(
    "commissioner_extend_deadline",
    {
      p_round_id: args.roundId,
      p_deadline_type: args.deadlineType,
    },
  );
  if (error) throw postgresToMixError(error);
}
