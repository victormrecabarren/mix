// Single tile inside the playlist horizontal rail. A square cover at the
// top with prompt + meta text beneath. The tile fills its column container
// so the column is responsible for sizing, not the tile.

import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ZoomSource } from "native-zoom";
import { THEME } from "@/ui/theme";
import { imageForKey } from "@/ui/theme/images";

export type PlaylistRailTileProps = {
  prompt: string;
  meta?: string;
  imageKey?: string;
  tracksCount?: number;
  status?: string;
  onPress?: () => void;
  zoomSourceId?: string;
};

export function PlaylistRailTile({
  prompt,
  meta,
  imageKey,
  onPress,
  zoomSourceId,
}: PlaylistRailTileProps) {
  const image = imageForKey(imageKey);
  const artNode = image != null ? (
    <View style={styles.fill}>
      <Image
        source={image}
        style={styles.fill}
        contentFit="cover"
        contentPosition="top"
        transition={0}
      />
    </View>
  ) : null;

  return (
    <Pressable style={styles.item} onPress={onPress} disabled={!onPress}>
      {zoomSourceId ? (
        <ZoomSource zoomSourceId={zoomSourceId} style={styles.art}>
          {artNode}
        </ZoomSource>
      ) : (
        <View style={styles.art}>{artNode}</View>
      )}
      <Text style={styles.prompt} numberOfLines={2}>
        {prompt}
      </Text>
      {meta ? (
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    width: "100%",
  },
  art: {
    aspectRatio: 1,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: THEME.ink,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  fill: { width: "100%", height: "100%" },
  prompt: {
    ...THEME.text.playlistTilePrompt,
    marginTop: 8,
  },
  meta: {
    ...THEME.text.playlistTileMeta,
    marginTop: 2,
  },
});
