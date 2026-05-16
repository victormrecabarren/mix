// TEMP: video helpers for the preview. Optional videos live on the active
// theme next to their still image and tone.

import { THEME } from "./themes";
import type { ImageKey } from "./_images";

export const ROUND_VIDEOS = Object.fromEntries(
  Object.entries(THEME.rounds)
    .filter(([, round]) => round.video != null)
    .map(([key, round]) => [key, round.video]),
) as Partial<Record<ImageKey, number>>;

export function videoForKey(key: string | undefined): number | null {
  if (!key) return null;
  return ROUND_VIDEOS[key as ImageKey] ?? null;
}
