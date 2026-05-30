// Polished-metal gradient palettes shared by chrome glyphs, borders, and
// podium rings. Stops ramp light → mid → light → dark → light → mid so the
// gradient reads as hammered metal at any size. Used by ChromeText /
// ChromeBorder (silver default) and by rank/medal treatments (gold/silver/
// bronze) on the results, podium, and Now Playing surfaces.

export const CHROME_STOPS = [
  "#f5f5f5",
  "#d0d0d0",
  "#ffffff",
  "#b0b0b0",
  "#e8e8e8",
  "#c8c8c8",
] as const;

// Lighter champagne-gold variant — every stop pulled up a step so the dark
// banding doesn't drag the average tone into a muddy mustard.
export const GOLD_STOPS = [
  "#FFF0B0",
  "#E5BE54",
  "#FFF7CC",
  "#D6A742",
  "#F5D27E",
  "#E5BE54",
] as const;

// Lighter rose-bronze / copper variant. Same logic — the deep brown stops
// were eating the highlight; replaced with warmer mid-coppers.
export const BRONZE_STOPS = [
  "#F2CBA1",
  "#C58A60",
  "#F9DCBC",
  "#B07847",
  "#DBA478",
  "#C58A60",
] as const;

// 1st = gold, 2nd = silver (default chrome), 3rd = bronze.
export const PODIUM_STOPS: Record<1 | 2 | 3, readonly string[]> = {
  1: GOLD_STOPS,
  2: CHROME_STOPS,
  3: BRONZE_STOPS,
};
