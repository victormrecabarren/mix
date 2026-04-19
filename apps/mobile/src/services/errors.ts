// Typed error taxonomy for the services layer. Services throw these; clients
// catch on the concrete class (e.g. `if (err instanceof VoteBudgetError) …`).
//
// The Postgres RPCs use RAISE EXCEPTION with human-readable messages and no
// custom SQLSTATE, so the mapper matches on message text. If/when we add
// SQLSTATE codes to the RPCs, switch the mapper to use those.

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

export function postgresToMixError(err: { message?: string | null } | null | undefined): MixError {
  const msg = err?.message ?? "";
  if (!msg) return new UnknownMixError("Unknown error.", { cause: err });

  if (msg === "Round not found") return new RoundNotFoundError(err);
  if (msg.includes("not eligible to vote")) return new NotEligibleToVoteError(err);
  if (msg.includes("already voted in this round")) return new AlreadyVotedError(err);

  const budgetMatch = msg.match(/spend all (\d+) points \(submitted (\d+)\)/);
  if (budgetMatch) {
    return new VoteBudgetError(Number(budgetMatch[1]), Number(budgetMatch[2]), err);
  }

  return new UnknownMixError(msg, { cause: err });
}
