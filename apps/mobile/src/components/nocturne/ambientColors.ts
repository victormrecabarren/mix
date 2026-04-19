import { nocturne } from "@/theme/colors";

export type AmbientPalette = {
  accent: string;
  secondary: string;
};

/**
 * Map of route segment → ambient palette.
 * Keys match the last meaningful path segment of the screen.
 * Add more here to give new pages their own ambient mood.
 */
export const ambientByRoute: Record<string, AmbientPalette> = {
  // Home / league overview — cool blue
  index: { accent: nocturne.blueLight, secondary: nocturne.blue },
  // Season page — mint and blue (slightly greener mood)
  season: { accent: nocturne.mint, secondary: nocturne.blue },
  // Round page — rose + gold (warmer, more energetic)
  round: { accent: nocturne.rose, secondary: nocturne.gold },
  // Commissioner forms — neutral blue
  "create-league": { accent: nocturne.blueLight, secondary: nocturne.blue },
  "create-season": { accent: nocturne.blueLight, secondary: nocturne.blue },
};

export const defaultAmbient: AmbientPalette = {
  accent: nocturne.blueLight,
  secondary: nocturne.blue,
};

/**
 * Given a pathname (e.g. "/(tabs)/(home)/season/123"), return the palette
 * that matches the deepest segment we recognise.
 */
export function resolveAmbientForPath(pathname: string): AmbientPalette {
  // Strip grouping parens, split by /, drop empties
  const segs = pathname
    .replace(/\([^)]+\)/g, "")
    .split("/")
    .filter(Boolean);

  if (segs.length === 0) return ambientByRoute.index ?? defaultAmbient;

  // Walk from deepest to shallowest until we find a match
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = segs[i];
    if (ambientByRoute[seg]) return ambientByRoute[seg];
  }
  return defaultAmbient;
}
