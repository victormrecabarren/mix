// Apple Music–style floating mini-player pill. Pure presentational —
// no hooks into playback state, no router, no Supabase. All data is passed
// in via props so the same component can render preview fixtures and
// real-app playback state with identical styling.
//
// The visual design is ported from `apps/mobile/src/app/ui-preview/_NowPlayingBar.tsx`.
// Keep both in lockstep until that file becomes a thin shim around this one.

import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { CoverArt } from "@/ui/CoverArt";
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
  onPress,
  style,
}: NowPlayingPillProps) {
  // Hue prop accepts strings (legacy from preview) and numbers — normalize.
  const numericHue =
    typeof hue === "number" ? hue : hue != null ? Number(hue) : 200;

  return (
    <View style={[styles.wrap, style]}>
      <BlurView intensity={55} tint="light" style={styles.pill}>
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
          <Pressable style={styles.iconBtn} hitSlop={8} onPress={onPlayPause}>
            {isPlaying ? (
              <View style={styles.pauseRow}>
                <View style={styles.pauseBar} />
                <View style={[styles.pauseBar, { marginLeft: 4 }]} />
              </View>
            ) : (
              <View style={styles.playTriangle} />
            )}
          </Pressable>
          {onNext ? (
            <Pressable style={styles.iconBtn} hitSlop={8} onPress={onNext}>
              <View style={styles.skipRow}>
                <View style={styles.skipTriangle} />
                <View style={[styles.skipTriangle, { marginLeft: 2 }]} />
              </View>
            </Pressable>
          ) : null}
        </Pressable>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 10 },
  pill: {
    borderRadius: 32,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(11,11,11,0.06)",
  },
  pillInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(246,241,232,0.55)",
  },
  art: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  meta: { flex: 1, minWidth: 0 },
  title: { ...THEME.text.nowPlayingTitle },
  artist: { ...THEME.text.nowPlayingArtist, marginTop: 1 },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  // Play triangle (rotated 90° so it points right).
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 9,
    borderBottomWidth: 9,
    borderLeftWidth: 14,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: THEME.ink,
    marginLeft: 2,
  },
  pauseRow: { flexDirection: "row", alignItems: "center" },
  pauseBar: {
    width: 4,
    height: 14,
    backgroundColor: THEME.ink,
    borderRadius: 1,
  },
  skipRow: { flexDirection: "row", alignItems: "center" },
  skipTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftWidth: 11,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: THEME.ink,
  },
});
