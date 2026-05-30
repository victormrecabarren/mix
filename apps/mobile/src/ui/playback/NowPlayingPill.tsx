// Apple Music–style floating mini-player pill. Pure presentational —
// no hooks into playback state, no router, no Supabase. All data is passed
// in via props so the same component can render preview fixtures and
// real-app playback state with identical styling.
//
// The visual design is ported from `apps/mobile/src/app/ui-preview/_NowPlayingBar.tsx`.
// Keep both in lockstep until that file becomes a thin shim around this one.

import { Image } from "expo-image";
import { FastForward, Pause, Play, Rewind } from "lucide-react-native";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { CoverArt } from "@/ui/CoverArt";
import { GlassSurface } from "@/ui/glass/GlassSurface";
import { FLOATING_CHROME_HORIZONTAL_INSET } from "@/ui/nav/floatingChromeMetrics";
import { THEME } from "@/ui/theme/tokens";

export interface NowPlayingPillProps {
  title: string;
  artist?: string;
  /** Remote artwork URL. When provided, renders a real Image instead of CoverArt. */
  artworkUrl?: string;
  /**
   * Hue used by the CoverArt fallback when no `artworkUrl` is provided.
   * Numeric `0–360` degrees. Defaults to the theme's accent neighborhood.
   */
  hue?: string | number;
  /** Optional dual-hue gradient pair for the CoverArt fallback. */
  dual?: readonly [number, number];
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext?: () => void;
  /** When omitted, the previous button is hidden entirely (first track). */
  onPrevious?: () => void;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function NowPlayingPill({
  title,
  artist,
  artworkUrl,
  hue,
  dual,
  isPlaying,
  onPlayPause,
  onNext,
  onPrevious,
  onPress,
  style,
}: NowPlayingPillProps) {
  // Hue prop accepts strings (legacy from preview) and numbers — normalize.
  const numericHue =
    typeof hue === "number" ? hue : hue != null ? Number(hue) : 200;

  return (
    <View style={[styles.wrap, style]}>
      <GlassSurface
        glassEffectStyle="regular"
        interactive
        style={styles.pill}
      >
        <Pressable
          style={styles.pillInner}
          onPress={onPress}
          disabled={!onPress}
        >
          {artworkUrl ? (
            <Image source={{ uri: artworkUrl }} style={styles.art} />
          ) : (
            <CoverArt
              hue={Number.isFinite(numericHue) ? numericHue : 200}
              dual={dual}
              style={styles.art}
            />
          )}
          <View style={styles.meta}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {artist ? (
              <Text style={styles.artist} numberOfLines={1}>
                {artist}
              </Text>
            ) : null}
          </View>
          <View style={styles.controls}>
            {onPrevious ? (
              <Pressable
                style={styles.iconBtn}
                hitSlop={8}
                onPress={onPrevious}
              >
                <Rewind
                  size={20}
                  color={THEME.ink}
                  fill={THEME.ink}
                  strokeWidth={0}
                />
              </Pressable>
            ) : null}
            <Pressable style={styles.iconBtn} hitSlop={8} onPress={onPlayPause}>
              {isPlaying ? (
                <Pause
                  size={20}
                  color={THEME.ink}
                  fill={THEME.ink}
                  strokeWidth={0}
                />
              ) : (
                <Play
                  size={20}
                  color={THEME.ink}
                  fill={THEME.ink}
                  strokeWidth={0}
                />
              )}
            </Pressable>
            {onNext ? (
              <Pressable style={styles.iconBtn} hitSlop={8} onPress={onNext}>
                <FastForward
                  size={20}
                  color={THEME.ink}
                  fill={THEME.ink}
                  strokeWidth={0}
                />
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: FLOATING_CHROME_HORIZONTAL_INSET,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pill: {
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.15)",
  },
  pillInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  art: {
    width: 32,
    height: 32,
    borderRadius: 5,
  },
  meta: { flex: 1, minWidth: 0 },
  title: { ...THEME.text.nowPlayingTitle },
  artist: { ...THEME.text.nowPlayingArtist, marginTop: 1 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
