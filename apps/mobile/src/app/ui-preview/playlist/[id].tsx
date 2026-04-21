// TEMP: round / playlist detail — Apple Music playlist layout.
// Hero image fills ~45% of screen; title + subtitle + meta + Play/Shuffle
// buttons + description sit below; track list scrolls under.

import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { imageForKey, toneForKey } from "../_images";
import { v1 } from "../_tokens";

// Mock track list — replace with real round submissions when we wire services.
const TRACKS = [
  { title: "Motion Sickness", artist: "Phoebe Bridgers", duration: "4:02" },
  { title: "Landslide", artist: "Fleetwood Mac", duration: "3:19" },
  { title: "Ribs", artist: "Lorde", duration: "4:19" },
  { title: "End of Summer", artist: "Jónsi", duration: "2:49" },
  { title: "Videotape", artist: "Radiohead", duration: "4:39" },
  { title: "August", artist: "Taylor Swift", duration: "4:21" },
  { title: "The Party", artist: "St. Vincent", duration: "3:58" },
  { title: "Summertime Sadness", artist: "Lana Del Rey", duration: "4:25" },
];

export default function PlaylistDetail() {
  const router = useRouter();
  const { height: screenHeight } = useWindowDimensions();
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
  const image = imageForKey(params.imageKey);
  const tone = toneForKey(params.imageKey);

  const heroHeight = screenHeight * 0.66;

  return (
    <View style={styles.root}>
      {/* ── Hero image fills the top ~60% of the screen ── */}
      <View
        style={[styles.hero, { height: heroHeight, backgroundColor: tone }]}
      >
        {image != null ? (
          <>
            {/* Blurred backdrop — same image, blown up, heavily blurred.
                Fills the edges with the image's palette so landscape art
                doesn't letterbox. transition={0} disables expo-image's
                entry fade so the image commits in frame one — this is
                what eliminates the color flash behind the zoom. */}
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
            {/* Crisp foreground — top-anchored cover mirrors the tile's
                crop anchor. For source images authored as 1:2 portraits
                with a top-weighted focal, the full focal is visible and
                the image extends down to fill the hero naturally. */}
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
        {/* Bottom gradient tail — faked with a single dark View for now. */}
        <View style={styles.heroGradientTail} pointerEvents="none" />
      </View>

      {/* ── Top chrome over the hero ── */}
      <SafeAreaView
        style={styles.topChrome}
        edges={["top"]}
        pointerEvents="box-none"
      >
        <Pressable style={styles.circleBtn} onPress={() => router.back()}>
          <Text style={styles.circleBtnGlyph}>‹</Text>
        </Pressable>
        <View style={styles.topActions}>
          <View style={styles.actionPill}>
            <Text style={styles.actionPillGlyph}>+</Text>
            <View style={styles.actionPillDivider} />
            <Text style={styles.actionPillDots}>···</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* ── Scrollable content starts under the hero ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: heroHeight - 60 }, // overlap the bottom of the hero
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Title block is in the overlap zone — blends with the hero's bottom */}
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={3}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        </View>

        {/* Play + Shuffle buttons */}
        <View style={styles.buttonRow}>
          <Pressable style={[styles.actionBtn, styles.actionBtnBg]}>
            <View style={styles.playTriangle} />
            <Text style={styles.actionBtnLabel}>Play</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, styles.actionBtnBg]}>
            <Text style={styles.shuffleGlyph}>⇄</Text>
            <Text style={styles.actionBtnLabel}>Shuffle</Text>
          </Pressable>
        </View>

        {/* Description */}
        {description ? (
          <Text style={styles.description} numberOfLines={4}>
            {description}
          </Text>
        ) : null}

        {/* Track list */}
        <View style={styles.trackList}>
          {TRACKS.map((t, i) => (
            <View
              key={i}
              style={[
                styles.trackRow,
                i < TRACKS.length - 1 && styles.trackRowBorder,
              ]}
            >
              <View
                style={[
                  styles.trackArt,
                  { backgroundColor: `hsl(${(i * 47) % 360}, 55%, 62%)` },
                ]}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.trackTitle} numberOfLines={1}>
                  {t.title}
                </Text>
                <Text style={styles.trackArtist} numberOfLines={1}>
                  {t.artist}
                </Text>
              </View>
              <Text style={styles.trackMore}>···</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const SCREEN_W = Dimensions.get("window").width;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: v1.bg },

  // Hero
  hero: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
  },
  fill: { width: "100%", height: "100%" },
  heroGradientTail: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 160,
    backgroundColor: "rgba(0,0,0,0.35)",
  },

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
    fontSize: 24,
    color: v1.ink,
    marginTop: -2,
    fontFamily: v1.fonts.sansSemi,
  },
  topActions: { flexDirection: "row" },
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
    fontSize: 20,
    color: v1.ink,
    lineHeight: 22,
    fontFamily: v1.fonts.sansMedium,
  },
  actionPillDivider: {
    width: StyleSheet.hairlineWidth,
    height: 18,
    backgroundColor: "rgba(11,11,11,0.15)",
  },
  actionPillDots: {
    fontSize: 18,
    color: v1.ink,
    marginTop: -8,
    fontFamily: v1.fonts.sansSemi,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: 140,
  },

  // Title block
  titleBlock: {
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 4,
    marginBottom: 18,
  },
  title: {
    fontFamily: v1.fonts.serifMediumItalic,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: "#fff",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  subtitle: {
    fontFamily: v1.fonts.sansSemi,
    fontSize: 15,
    color: "rgba(255,255,255,0.9)",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  meta: {
    fontFamily: v1.fonts.sansMedium,
    fontSize: 12,
    color: "rgba(255,255,255,0.78)",
    textAlign: "center",
    marginTop: 2,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },

  // Buttons
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 22,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  actionBtnBg: {
    backgroundColor: "rgba(11,11,11,0.35)",
  },
  actionBtnLabel: {
    fontFamily: v1.fonts.sansSemi,
    fontSize: 15,
    color: "#fff",
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
    fontSize: 18,
    color: "#fff",
    fontFamily: v1.fonts.sansBold,
  },

  // Description
  description: {
    paddingHorizontal: 24,
    fontFamily: v1.fonts.sansMedium,
    fontSize: 13,
    lineHeight: 19,
    color: v1.muted,
    marginBottom: 22,
  },

  // Track list
  trackList: {
    backgroundColor: v1.bg,
    paddingHorizontal: 20,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  trackRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: v1.rule,
  },
  trackArt: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  trackTitle: {
    fontFamily: v1.fonts.sansSemi,
    fontSize: 15,
    color: v1.ink,
  },
  trackArtist: {
    fontFamily: v1.fonts.sansMedium,
    fontSize: 12,
    color: v1.muted,
    marginTop: 1,
  },
  trackMore: {
    fontFamily: v1.fonts.sansBold,
    fontSize: 16,
    color: v1.muted,
    width: 20,
    textAlign: "right",
  },
});

void SCREEN_W;
