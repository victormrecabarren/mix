// Typed error taxonomy for the services layer. Services throw these; clients
// catch on the concrete class (e.g. `if (err instanceof VoteBudgetError) …`).
//
// The Postgres RPCs/triggers use RAISE EXCEPTION with human-readable messages
// and no custom SQLSTATE, so the mapper matches on message text. If/when we
// add SQLSTATE codes, switch the mapper to use those.

export class MixError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

export class UnknownMixError extends MixError {}

export class RoundNotFoundError extends MixError {
  constructor(cause?: unknown) {
    super("Round not found.", { cause });
  }
}

// ─── Vote errors ──────────────────────────────────────────────────────────────

export class NotEligibleToVoteError extends MixError {
  constructor(cause?: unknown) {
    super("You didn't submit a track this round, so you can't vote.", { cause });
  }
}

export class AlreadyVotedError extends MixError {
  constructor(cause?: unknown) {
    super("You've already voted in this round.", { cause });
  }
}

export class VoteBudgetError extends MixError {
  required: number;
  provided: number;
  constructor(required: number, provided: number, cause?: unknown) {
    super(`You must spend all ${required} points (submitted ${provided}).`, { cause });
    this.required = required;
    this.provided = provided;
  }
}

// ─── Submission errors ────────────────────────────────────────────────────────

export class DeadlinePassedError extends MixError {
  constructor(cause?: unknown) {
    super("The submission deadline for this round has passed.", { cause });
  }
}

export class MaxSubmissionsReachedError extends MixError {
  existing: number;
  allowed: number;
  constructor(existing: number, allowed: number, cause?: unknown) {
    super(
      `You've reached the submission limit for this round (${existing} of ${allowed}).`,
      { cause },
    );
    this.existing = existing;
    this.allowed = allowed;
  }
}

export class PreviousRoundInProgressError extends MixError {
  constructor(cause?: unknown) {
    super("The previous round is still in progress.", { cause });
  }
}

export class SpectatorCannotSubmitError extends MixError {
  constructor(cause?: unknown) {
    super("Spectators can't submit tracks.", { cause });
  }
}

export class NotLeagueMemberError extends MixError {
  constructor(cause?: unknown) {
    super("You're not a member of this league.", { cause });
  }
}

// ─── Auth / generic ───────────────────────────────────────────────────────────

export class NotAuthenticatedError extends MixError {
  constructor(cause?: unknown) {
    super("You're not signed in.", { cause });
  }
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

export function postgresToMixError(err: { message?: string | null } | null | undefined): MixError {
  const msg = err?.message ?? "";
  if (!msg) return new UnknownMixError("Unknown error.", { cause: err });

  // Round-level
  if (msg === "Round not found") return new RoundNotFoundError(err);

  // Vote
  if (msg.includes("not eligible to vote")) return new NotEligibleToVoteError(err);
  if (msg.includes("already voted in this round")) return new AlreadyVotedError(err);
  const budgetMatch = msg.match(/spend all (\d+) points \(submitted (\d+)\)/);
  if (budgetMatch) {
    return new VoteBudgetError(Number(budgetMatch[1]), Number(budgetMatch[2]), err);
  }

  // Submission
  if (msg.includes("Submission deadline has passed")) return new DeadlinePassedError(err);
  const maxSubsMatch = msg.match(/maximum number of tracks for this round \((\d+) of (\d+)\)/);
  if (maxSubsMatch) {
    return new MaxSubmissionsReachedError(
      Number(maxSubsMatch[1]),
      Number(maxSubsMatch[2]),
      err,
    );
  }
  if (msg.includes("Previous round is still in progress")) return new PreviousRoundInProgressError(err);
  if (msg.includes("Spectators cannot submit")) return new SpectatorCannotSubmitError(err);
  if (msg.includes("not a member of this league")) return new NotLeagueMemberError(err);

  return new UnknownMixError(msg, { cause: err });
}
