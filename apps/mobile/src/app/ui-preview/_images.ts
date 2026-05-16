// TEMP: image helpers for the preview. Actual assets live on the active theme
// so changing `themes/index.ts` changes the visual system in one place.

import { THEME } from "./themes";

export type ImageKey = keyof typeof THEME.rounds;

export const ROUND_IMAGES = Object.fromEntries(
  Object.entries(THEME.rounds).map(([key, round]) => [key, round.image]),
) as Record<ImageKey, number>;

export const ROUND_TONES = Object.fromEntries(
  Object.entries(THEME.rounds).map(([key, round]) => [key, round.tone]),
) as Record<ImageKey, string>;

export function imageForKey(key: string | undefined): number | null {
  if (!key) return null;
  return ROUND_IMAGES[key as ImageKey] ?? null;
}

export function toneForKey(key: string | undefined): string {
  if (!key) return THEME.defaultTone;
  return ROUND_TONES[key as ImageKey] ?? THEME.defaultTone;
}
