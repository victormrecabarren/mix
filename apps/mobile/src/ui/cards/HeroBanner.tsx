// Apple-Music-style hero banner used by playlist / round detail views.
// Lifted verbatim from `app/ui-preview/playlist/[id].tsx` so the preview and
// real screens share one visual. Pure presentational — no data fetching, no
// router calls. Hosting screens wire onBack, ctas, status, etc.
//
// Visual: ~66% screen-height image hero with a blurred backdrop layer + a
// crisp top-anchored foreground. Optional muted/looping motion artwork
// (videoKey) plays on top. Title block sits in the bottom overlap zone.

import type { ReactNode } from "react";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { THEME } from "@/ui/theme";
import { imageForKey, toneForKey } from "@/ui/theme/images";
import { videoForKey } from "@/ui/theme/videos";

// Tuning constants matching the preview's draft motion artwork. When videos
// are re-authored to a centered focal zone these can be removed.
const HERO_VIDEO_OFFSET_X = 13;
const HERO_VIDEO_OFFSET_Y = 25;

function HeroVideoLayer({ source }: { source: number }) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={{
        width: "93%",
        height: "93%",
        transform: [
          { translateX: HERO_VIDEO_OFFSET_X },
          { translateY: HERO_VIDEO_OFFSET_Y },
        ],
      }}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

export type HeroBannerStatus =
  | "live"
  | "upcoming"
  | "submissions"
  | "voting"
  | "results";

export type HeroBannerProps = {
  imageKey?: string;
  videoKey?: string;
  title: string;
  subtitle?: string;
  meta?: string;
  ctas?: { play?: () => void; shuffle?: () => void };
  trailing?: ReactNode;
  status?: HeroBannerStatus;
  onBack?: () => void;
};

export function HeroBanner({
  imageKey,
  videoKey,
  title,
  subtitle,
  meta,
  ctas,
  trailing,
  onBack,
}: HeroBannerProps) {
  const { height: screenHeight } = useWindowDimensions();
  const image = imageForKey(imageKey);
  const video = videoForKey(videoKey ?? imageKey);
  const tone = toneForKey(imageKey);

  const heroHeight = screenHeight * 0.66;

  return (
    <View>
      {/* ── Hero image fills the top ~66% of the screen ── */}
      <View
        style={[styles.hero, { height: heroHeight, backgroundColor: tone }]}
      >
        {image != null ? (
          <>
            <View style={StyleSheet.absoluteFillObject}>
              <Image
                source={image}
                style={styles.fill}
                blurRadius={40}
                contentFit="cover"
                contentPosition="top"
                transition={0}
              />
            </View>
            <View style={StyleSheet.absoluteFillObject}>
              <Image
                source={image}
                style={styles.fill}
                contentFit="cover"
                contentPosition="top"
                transition={0}
              />
            </View>
          </>
        ) : null}
        {video != null && (
          <View style={StyleSheet.absoluteFillObject}>
            <HeroVideoLayer source={video} />
          </View>
        )}
      </View>

      {/* ── Top chrome over the hero ── */}
      <SafeAreaView
        style={styles.topChrome}
        edges={["top"]}
        pointerEvents="box-none"
      >
        {onBack ? (
          <Pressable style={styles.circleBtn} onPress={onBack}>
            <Text style={styles.circleBtnGlyph}>‹</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <View style={styles.topActions}>{trailing}</View>
      </SafeAreaView>

      {/* ── Title block + play/shuffle, layered over the bottom of the hero ── */}
      <View style={[styles.titleAndButtons, { marginTop: -206 }]}>
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={3}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          {meta ? (
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>

        {(ctas?.play || ctas?.shuffle) && (
          <View style={styles.buttonRow}>
            {ctas.play && (
              <Pressable
                style={[styles.actionBtn, styles.actionBtnBg]}
                onPress={ctas.play}
              >
                <View style={styles.playTriangle} />
                <Text style={styles.actionBtnLabel}>Play</Text>
              </Pressable>
            )}
            {ctas.shuffle && (
              <Pressable
                style={[styles.actionBtn, styles.actionBtnBg]}
                onPress={ctas.shuffle}
              >
                <Text style={styles.shuffleGlyph}>⇄</Text>
                <Text style={styles.actionBtnLabel}>Shuffle</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Hero — copied from preview
  hero: {
    overflow: "hidden",
  },
  fill: { width: "100%", height: "100%" },

  // Top chrome
  topChrome: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 10,
  },
  circleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  circleBtnGlyph: {
    ...THEME.text.detailChromeGlyph,
    marginTop: -2,
  },
  topActions: { flexDirection: "row" },

  // Title block sits in the overlap zone — blends with the hero's bottom.
  titleAndButtons: {
    // Empty placeholder; marginTop is set inline above so it follows the hero.
  },
  titleBlock: {
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 4,
    marginBottom: 0,
  },
  title: {
    ...THEME.text.detailTitle,
  },
  subtitle: {
    ...THEME.text.detailSubtitle,
  },
  meta: {
    ...THEME.text.detailMeta,
    marginTop: 2,
  },

  // Buttons
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 32,
    marginBottom: 14,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 26,
  },
  actionBtnBg: {
    backgroundColor: "rgba(141, 1, 73, 0.35)",
  },
  actionBtnLabel: {
    ...THEME.text.detailActionButtonLabel,
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftWidth: 10,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "#fff",
    marginLeft: 2,
  },
  shuffleGlyph: {
    ...THEME.text.detailShuffleGlyph,
  },
});
