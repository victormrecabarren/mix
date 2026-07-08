// Shared round-detail hero used by the voting + playlist screens. Renders
// the round's cover image + muted-loop video, with a vertical alpha mask
// at the bottom so the artwork fades cleanly into whatever page background
// sits below (iridescent wash, typically).

import { Image as ExpoImage } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { StyleSheet, View } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { imageForKey, toneForKey } from "@/ui/theme/images";
import { videoForKey } from "@/ui/theme/videos";

// Tuning constants from the original ui-preview Motion Artwork POC.
const HERO_VIDEO_OFFSET_X = 13;
const HERO_VIDEO_OFFSET_Y = 25;

// Single hero artwork used by every round-detail surface so the iOS .zoom
// transition can hand off cleanly between home → voting → results →
// playlist.
export const ROUND_HERO_IMAGE_KEY = "disco-balloon-hero";

function HeroVideoLayer({ source }: { source: number }) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.volume = 0;
    p.audioMixingMode = "mixWithOthers";
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

export function RoundHero({
  imageKey = ROUND_HERO_IMAGE_KEY,
  heroHeight,
}: {
  imageKey?: string;
  heroHeight: number;
}) {
  const image = imageForKey(imageKey);
  const video = videoForKey(imageKey);
  const tone = toneForKey(imageKey);

  return (
    <MaskedView
      style={{ height: heroHeight }}
      maskElement={
        <LinearGradient
          colors={["#000", "#000", "transparent"]}
          locations={[0, 0.6, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      }
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tone }]}>
        {image != null ? (
          <>
            <View style={StyleSheet.absoluteFillObject}>
              <ExpoImage
                source={image}
                style={{ width: "100%", height: "100%" }}
                blurRadius={40}
                contentFit="cover"
                contentPosition="top"
                transition={0}
              />
            </View>
            <View style={StyleSheet.absoluteFillObject}>
              <ExpoImage
                source={image}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                contentPosition="top"
                transition={0}
              />
            </View>
          </>
        ) : null}
        {video != null ? (
          <View style={StyleSheet.absoluteFillObject}>
            <HeroVideoLayer source={video} />
          </View>
        ) : null}
      </View>
    </MaskedView>
  );
}
