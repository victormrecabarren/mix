// Full-bleed page wallpaper. Pulls `THEME.wallpaper` from the active theme
// (a Supabase Storage URL) and renders it as an absolute-positioned cover
// image behind any children. Themes without `wallpaper` fall back to the
// flat `bg` color.

import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { THEME } from "@/ui/theme";
import { IridescentWash } from "@/ui/IridescentWash";

// Opacity of the wallpaper PNG overlaid on top of the iridescent wash.
// 1 = current bubblegum look; 0 = pure lilac wash with no halftone overlay.
// 0.25–0.4 gives a "halftone hint" reading over the iridescent base.
const WALLPAPER_IMAGE_OPACITY = 0.3;

export function Wallpaper({
  children,
  halftone = true,
}: {
  children?: ReactNode;
  // When true (default) the bubblegum halftone PNG overlays the iridescent
  // wash at low opacity. Voting / playlist screens set `halftone={false}`
  // so the hero image fades cleanly into the wash without dot collision.
  halftone?: boolean;
}) {
  return (
    <View style={styles.root}>
      <IridescentWash />
      {halftone && THEME.wallpaper ? (
        <Image
          source={{ uri: THEME.wallpaper }}
          style={[
            styles.wallpaperImage,
            { opacity: WALLPAPER_IMAGE_OPACITY },
          ]}
          contentFit="cover"
          contentPosition="top right"
          cachePolicy="memory-disk"
          transition={0}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  wallpaperImage: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "180%",
    height: "180%",
  },
});
