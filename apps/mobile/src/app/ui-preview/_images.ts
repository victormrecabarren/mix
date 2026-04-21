// TEMP: central image registry for the preview. Keys here are passed
// through nav params; the home and detail screens both look up the actual
// `require()` source through this map. Delete when we move to Supabase-
// hosted imagery.

export type ImageKey =
  | "disco-balloon"
  | "disco-encrusted"
  | "disco-knot"
  | "disco-scene"
  | "disco-string";

export const ROUND_IMAGES: Record<ImageKey, number> = {
  "disco-balloon": require("../../../assets/images/rounds/Disco-Hero-Tall.png"),
  "disco-encrusted": require("../../../assets/images/rounds/Disco-Encrusted.jpeg"),
  "disco-knot": require("../../../assets/images/rounds/Disco-Knot.png"),
  "disco-scene": require("../../../assets/images/rounds/Disco-Scene.png"),
  "disco-string": require("../../../assets/images/rounds/Disco-String-Header.png"),
};

// Dominant-tone for each image. Used as the hero's background color on the
// detail screen so the first frame of the zoom transition doesn't flash
// black before the image commits. Eyeballed from the source art — when you
// swap images, re-pick.
export const ROUND_TONES: Record<ImageKey, string> = {
  "disco-balloon": "#c48f1a", // gold
  "disco-encrusted": "#8d2c5c", // magenta
  "disco-knot": "#d48a22", // amber
  "disco-scene": "#7a2f68", // plum
  "disco-string": "#4d3a70", // indigo
};

export function imageForKey(key: string | undefined): number | null {
  if (!key) return null;
  return ROUND_IMAGES[key as ImageKey] ?? null;
}

export function toneForKey(key: string | undefined): string {
  if (!key) return "#141414";
  return ROUND_TONES[key as ImageKey] ?? "#141414";
}
