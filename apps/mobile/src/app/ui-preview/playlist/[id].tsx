// TEMP: round / playlist detail — Apple Music playlist layout.
// Visual is composed from `@/ui/cards/HeroBanner` + `@/ui/sections/TrackList`.
// Hardcoded fixtures live here at the preview level.

import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { THEME } from "../_tokens";
import { HeroBanner } from "@/ui/cards/HeroBanner";
import { TrackList, type TrackListItem } from "@/ui/sections/TrackList";

// Mock track list — replace with real round submissions when we wire services.
const TRACKS: TrackListItem[] = [
  { id: "1", title: "Motion Sickness", artist: "Phoebe Bridgers" },
  { id: "2", title: "Landslide", artist: "Fleetwood Mac" },
  { id: "3", title: "Ribs", artist: "Lorde" },
  { id: "4", title: "End of Summer", artist: "Jónsi" },
  { id: "5", title: "Videotape", artist: "Radiohead" },
  { id: "6", title: "August", artist: "Taylor Swift" },
  { id: "7", title: "The Party", artist: "St. Vincent" },
  { id: "8", title: "Summertime Sadness", artist: "Lana Del Rey" },
];

export default function PlaylistDetail() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    title?: string;
    subtitle?: string;
    meta?: string;
    imageKey?: string;
    description?: string;
  }>();

  const title = params.title ?? "Round";
  const subtitle = params.subtitle ?? "Mix · Season";
  const meta = params.meta ?? "Updated today";
  const description = params.description ?? "";

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <HeroBanner
          imageKey={params.imageKey}
          videoKey={params.imageKey}
          title={title}
          subtitle={subtitle}
          meta={meta}
          ctas={{ play: () => {}, shuffle: () => {} }}
          trailing={
            <View style={styles.actionPill}>
              <Text style={styles.actionPillGlyph}>+</Text>
              <View style={styles.actionPillDivider} />
              <Text style={styles.actionPillDots}>···</Text>
            </View>
          }
          onBack={() => router.back()}
        />

        {description ? (
          <Text style={styles.description} numberOfLines={4}>
            {description}
          </Text>
        ) : null}

        <TrackList tracks={TRACKS} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  scrollContent: {
    paddingBottom: 140,
  },
  description: {
    ...THEME.text.detailDescription,
    paddingHorizontal: 24,
    marginBottom: 22,
    marginTop: 8,
  },
  actionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  actionPillGlyph: {
    ...THEME.text.detailActionPillGlyph,
  },
  actionPillDivider: {
    width: 1,
    height: 18,
    backgroundColor: "rgba(11,11,11,0.15)",
  },
  actionPillDots: {
    ...THEME.text.detailActionPillDots,
    marginTop: -8,
  },
});
