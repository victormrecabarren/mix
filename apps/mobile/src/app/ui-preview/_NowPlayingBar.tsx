// Preview shim — wraps the real-app NowPlayingPill so the preview's home
// screen keeps its (title, artist, hue, dual) prop shape while the actual
// styling/behavior is sourced from `@/ui/playback/NowPlayingPill`.
//
// Promotion path: when the preview is retired, delete this file along with
// the rest of `ui-preview/`. The real app already imports the pill directly.

import { useState } from "react";
import { NowPlayingPill } from "@/ui/playback/NowPlayingPill";

export function NowPlayingBar({
  title,
  artist,
  hue,
  dual,
}: {
  title: string;
  artist: string;
  hue: number;
  dual?: readonly [number, number];
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  return (
    <NowPlayingPill
      title={title}
      artist={artist}
      hue={hue}
      dual={dual}
      isPlaying={isPlaying}
      onPlayPause={() => setIsPlaying((v) => !v)}
      onNext={() => {}}
    />
  );
}
