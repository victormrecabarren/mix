// Horizontal scroller of 2-tall columns. Visually matches a 2-col square
// grid when at rest (2 columns visible = 4 tiles in view) but keeps growing
// off-screen instead of down the page. Items flow top-to-bottom within a
// column, then wrap to the next column.

import { useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import {
  PlaylistRailTile,
  type PlaylistRailTileProps,
} from "./PlaylistRailTile";

// Playlist rail layout constants. Kept here so a screen can mirror the
// horizontal padding for the section header without reaching in.
export const PLAYLIST_RAIL_H_PADDING = 22;
export const PLAYLIST_RAIL_GAP = 12;
const RAIL_COLUMNS_VISIBLE = 2;

export type PlaylistRailItem = PlaylistRailTileProps & { id: string };

export type PlaylistRailProps = {
  items: PlaylistRailItem[];
};

export function PlaylistRail({ items }: PlaylistRailProps) {
  const { width: screenW } = useWindowDimensions();

  // Tile width chosen so RAIL_COLUMNS_VISIBLE columns fit exactly inside the
  // rail's content area (screen minus horizontal padding, minus the gaps
  // between the visible columns).
  const tileWidth =
    (screenW -
      PLAYLIST_RAIL_H_PADDING * 2 -
      PLAYLIST_RAIL_GAP * (RAIL_COLUMNS_VISIBLE - 1)) /
    RAIL_COLUMNS_VISIBLE;

  // Chunk items into 2-tall columns. Items flow top-to-bottom within a
  // column, then wrap to the next column (reading order: [0]=col0/row0,
  // [1]=col0/row1, [2]=col1/row0, [3]=col1/row1, [4]=col2/row0, ...).
  const columns = useMemo(() => {
    const out: PlaylistRailItem[][] = [];
    for (let i = 0; i < items.length; i += 2) {
      out.push(items.slice(i, i + 2));
    }
    return out;
  }, [items]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Snap a column at a time for a tactile feel. decelerationRate "fast"
      // keeps the swipe crisp; without it snap feels sluggish.
      decelerationRate="fast"
      snapToInterval={tileWidth + PLAYLIST_RAIL_GAP}
      snapToAlignment="start"
      contentContainerStyle={styles.content}
    >
      {columns.map((col, colIdx) => (
        <View
          key={`col-${colIdx}`}
          style={[styles.column, { width: tileWidth }]}
        >
          {col.map((item) => {
            const { id, ...tileProps } = item;
            return <PlaylistRailTile key={id} {...tileProps} />;
          })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: PLAYLIST_RAIL_H_PADDING,
    paddingTop: 14,
    gap: PLAYLIST_RAIL_GAP,
  },
  column: {
    // Two rows inside each column, evenly spaced.
    gap: PLAYLIST_RAIL_GAP,
  },
});
