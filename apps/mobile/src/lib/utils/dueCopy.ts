function isSameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDateLabel(due: Date, now: Date): string {
  if (isSameLocalDate(due, now)) return "today";
  if (isSameLocalDate(due, addDays(now, 1))) return "tomorrow";
  return due.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });
}

function formatTime(due: Date): string {
  return due.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRemaining(diffMs: number): string | null {
  if (diffMs <= 0 || diffMs >= 24 * 60 * 60 * 1000) return null;

  if (diffMs < 60 * 60 * 1000) {
    const minutes = Math.floor(diffMs / 60_000);
    return `${minutes} ${minutes === 1 ? "min" : "mins"} left!`;
  }

  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  return `~${hours} ${hours === 1 ? "hour" : "hours"} left!`;
}

export function formatVotesDueCopy(
  deadlineIso: string,
  now: Date = new Date(),
): string {
  const due = new Date(deadlineIso);
  const base = `Votes due ${formatDateLabel(due, now)} at ${formatTime(due)}`;
  const remaining = formatRemaining(due.getTime() - now.getTime());
  return remaining ? `${base} · ${remaining}` : base;
}
