// Maps a round to one of the theme's cover image keys using the round number.
// Rounds cycle through the list in order — round 1 → index 0, round 21 → index 0
// again, etc. Append new keys to the end of COVER_KEYS to add more without
// shifting existing round assignments.
//
// Pure: no React, no Supabase. The actual image bytes/tones live on the theme —
// see `apps/mobile/src/ui/theme/images.ts`.

// Keep this list in the same order as DISCO_THEME.rounds in ui/theme/disco.ts.
// Append new keys to the end — never reorder, or round assignments shift.
export const COVER_KEYS = [
  "disco-encrusted",
  "disco-knot",
  "disco-scene",
  "disco-string",
] as const;

export type CoverKey = (typeof COVER_KEYS)[number];

export function roundCoverKey(round: { round_number: number }): string {
  return COVER_KEYS[(round.round_number - 1) % COVER_KEYS.length];
}
