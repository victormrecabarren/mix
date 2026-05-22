// Pure helpers for deriving the current round phase and a human-readable
// countdown from round timestamps. Lifted from RoundScreen's local `getPhase`
// so screens, tab badges, and previews can share a single source of truth.
//
// Phase rule recap:
//   - now >= voting_deadline_at        → "results"
//   - submission_deadline_at <= now    → "voting"
//   - prevRound is set and not closed  → "upcoming"
//   - otherwise                        → "submissions"

export type RoundPhase = "upcoming" | "submissions" | "voting" | "results";

export type DerivePhaseRound = {
  submission_deadline_at: string;
  voting_deadline_at: string;
};

export type DerivePhasePrevRound = {
  voting_deadline_at: string;
} | null;

export function derivePhase(
  round: DerivePhaseRound,
  prevRound: DerivePhasePrevRound = null,
  now: Date = new Date(),
): RoundPhase {
  const t = now.getTime();
  const sub = new Date(round.submission_deadline_at).getTime();
  const vote = new Date(round.voting_deadline_at).getTime();

  if (t >= vote) return "results";
  if (t >= sub) return "voting";

  if (prevRound && t < new Date(prevRound.voting_deadline_at).getTime()) {
    return "upcoming";
  }

  return "submissions";
}

// ─── Countdown formatting ─────────────────────────────────────────────────────

const PHASE_VERBS: Record<RoundPhase, string> = {
  upcoming: "Opens in",
  submissions: "Submissions close in",
  voting: "Voting closes in",
  results: "Round complete",
};

function formatRemaining(ms: number): string {
  if (ms <= 0) return "<1m";

  const totalMinutes = Math.floor(ms / 60_000);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);

  if (days >= 1) {
    const hours = totalHours - days * 24;
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (totalHours >= 1) {
    const minutes = totalMinutes - totalHours * 60;
    return minutes > 0 ? `${totalHours}h ${minutes}m` : `${totalHours}h`;
  }
  if (totalMinutes >= 1) return `${totalMinutes}m`;
  return "<1m";
}

// Returns a human-readable countdown string for the current phase, e.g.:
//   "Voting closes in 1d 11h"
//   "Submissions close in 3h 20m"
//   "Opens in 5d"
//   "Round complete"
export function formatPhaseCountdown(
  round: DerivePhaseRound,
  prevRound: DerivePhasePrevRound = null,
  now: Date = new Date(),
): string {
  const phase = derivePhase(round, prevRound, now);
  if (phase === "results") return PHASE_VERBS.results;

  const t = now.getTime();
  let targetMs: number;
  if (phase === "voting") {
    targetMs = new Date(round.voting_deadline_at).getTime();
  } else if (phase === "submissions") {
    targetMs = new Date(round.submission_deadline_at).getTime();
  } else {
    // upcoming — show the time until the prev round's voting closes,
    // which is when this round opens for submissions.
    targetMs = prevRound
      ? new Date(prevRound.voting_deadline_at).getTime()
      : new Date(round.submission_deadline_at).getTime();
  }

  return `${PHASE_VERBS[phase]} ${formatRemaining(targetMs - t)}`;
}
