// Big "Live round · vote open" editorial card with prompt, descriptor,
// phase countdown, optional live dot badge, and CTA. The image fills
// a 16:10 tile with a top-anchored cover-fit crop matching the preview.

import { Image } from "expo-image";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { ZoomSource } from "native-zoom";
import { THEME } from "@/ui/theme";
import { imageForKey } from "@/ui/theme/images";

// Where the active-card cover-fit crop is anchored in the source image.
// 0% = top of source, 100% = bottom. Raise to slide the visible slice DOWN
// the image. Iterate until the focal sits right in the 16:10 tile.
const ACTIVE_CARD_CROP_Y = "32%";

export type HeroStatus =
  | "live"
  | "upcoming"
  | "submissions"
  | "voting"
  | "results";

export type HeroRoundCardProps = {
  prompt: string;
  descriptor?: string;
  phaseLabel: string;
  ctaLabel?: string;
  status?: HeroStatus;
  imageKey?: string;
  onPress?: () => void;
  zoomSourceId?: string;
  style?: StyleProp<ViewStyle>;
};

// Human-readable preface above the prompt. The preview uses "Live round ·
// vote open" for the live state — we expose the rest of the statuses as
// matching editorial captions.
const STATUS_LABEL: Record<HeroStatus, string> = {
  live: "Live round · vote open",
  upcoming: "Up next",
  submissions: "Submissions open",
  voting: "Live round · vote open",
  results: "Round wrapped",
};

function showsLiveDot(status: HeroStatus | undefined): boolean {
  return status === "live" || status === "voting";
}

export function HeroRoundCard({
  prompt,
  descriptor,
  phaseLabel,
  ctaLabel,
  status = "live",
  imageKey,
  onPress,
  zoomSourceId,
  style,
}: HeroRoundCardProps) {
  const image = imageForKey(imageKey);
  const liveDot = showsLiveDot(status);
  const caption = STATUS_LABEL[status];

  const imageNode = image != null ? (
    <View style={styles.fill}>
      <Image
        source={image}
        style={styles.fill}
        contentFit="cover"
        contentPosition={{ top: ACTIVE_CARD_CROP_Y }}
        transition={0}
      />
    </View>
  ) : null;

  return (
    <View style={style}>
      <View style={styles.meta}>
        <Text style={styles.liveLabel}>{caption}</Text>
        <Text style={styles.prompt}>{prompt}.</Text>
        {descriptor ? <Text style={styles.descriptor}>{descriptor}</Text> : null}
      </View>

      <Pressable style={styles.imageWrap} onPress={onPress} disabled={!onPress}>
        {zoomSourceId ? (
          <ZoomSource zoomSourceId={zoomSourceId} style={styles.zoom}>
            {imageNode}
          </ZoomSource>
        ) : (
          <View style={styles.zoom}>{imageNode}</View>
        )}
        {liveDot ? (
          <View style={styles.liveBadge} pointerEvents="none">
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>Live</Text>
          </View>
        ) : null}
        <View style={styles.imageFooter} pointerEvents="none">
          <Text style={styles.phase}>{phaseLabel}</Text>
          {ctaLabel ? <Text style={styles.cta}>{ctaLabel}</Text> : null}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { paddingHorizontal: 22, paddingTop: 10 },
  liveLabel: {
    ...THEME.text.homeLiveLabel,
  },
  prompt: {
    ...THEME.text.homeHeroPrompt,
    marginTop: 6,
  },
  descriptor: {
    ...THEME.text.homeHeroDescriptor,
    marginTop: 6,
  },

  imageWrap: {
    // Mathematically centered (22 on each side). If the card reads as
    // left-leaning, that's the liveBadge + left-aligned meta above
    // biasing your eye — bump the left margin +1-2pt to optically center.
    marginLeft: 22,
    marginRight: 0,
    marginTop: 14,
    borderRadius: 22,
    overflow: "hidden",
    aspectRatio: 16 / 10,
    shadowColor: THEME.ink,
    shadowOpacity: 0.16,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 14 },
  },
  zoom: { flex: 1 },
  fill: { width: "100%", height: "100%" },

  liveBadge: {
    position: "absolute",
    top: 14,
    left: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.accent,
  },
  liveBadgeText: {
    ...THEME.text.liveBadgeText,
  },
  imageFooter: {
    position: "absolute",
    bottom: 14,
    left: 14,
    right: 14,
  },
  phase: {
    ...THEME.text.homeHeroPhase,
  },
  cta: {
    ...THEME.text.homeHeroCta,
    marginTop: 4,
  },
});
