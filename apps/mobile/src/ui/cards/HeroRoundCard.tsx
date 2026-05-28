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
import { ChromeBorder } from "@/ui/ChromeBorder";

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

  // Caption + descriptor are no longer painted on the home page (the round
  // prompt now renders below the card as its own halo'd headline). They
  // remain in props for callers that still want them surfaced (e.g. the
  // ui-preview playground); silence the lint warnings here.
  void caption;
  void prompt;
  void descriptor;

  return (
    <View style={style}>
      <ChromeBorder radius={22} thickness={2} clip style={styles.imageWrap}>
        <Pressable style={styles.fill} onPress={onPress} disabled={!onPress}>
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
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          ) : null}
          <View style={styles.imageFooter} pointerEvents="none">
            <Text style={styles.phase}>{phaseLabel.toUpperCase()}</Text>
            {ctaLabel ? <Text style={styles.cta}>{ctaLabel}</Text> : null}
          </View>
        </Pressable>
      </ChromeBorder>
    </View>
  );
}

const styles = StyleSheet.create({
  imageWrap: {
    // ChromeBorder owns the radius + clip. Margins, aspect ratio, and shadow
    // stay on the outer wrapper so they apply to the metal ring, not the
    // image inside.
    marginLeft: 22,
    marginRight: 22,
    marginTop: 14,
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
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    // Reference uses the lime accent dot; bubblegum replaces accent with
    // chrome on glyphs but a small red live dot reads as the system "rec"
    // indicator everywhere.
    backgroundColor: "#FF3B5C",
  },
  liveBadgeText: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: THEME.ink,
  },
  imageFooter: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    alignItems: "center",
  },
  phase: {
    fontFamily: THEME.fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: "rgba(255,255,255,0.95)",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cta: {
    fontFamily: THEME.fonts.serifMediumItalic,
    fontSize: 20,
    lineHeight: 24,
    color: "#fff",
    marginTop: 6,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
