import type { UiPreviewTheme } from "./types";

const fonts = {
  serifRegular: "Fraunces_400Regular",
  serifItalic: "Fraunces_400Regular_Italic",
  serifMedium: "Fraunces_500Medium",
  serifMediumItalic: "Fraunces_500Medium_Italic",
  serifBold: "Fraunces_700Bold",
  sans: "InterTight_400Regular",
  sansMedium: "InterTight_500Medium",
  sansSemi: "InterTight_600SemiBold",
  sansBold: "InterTight_700Bold",
};

const colors = {
  bg: "#F6F1E8",
  surface: "#FFFFFF",
  ink: "#0B0B0B",
  muted: "#6B6257",
  faint: "#A69D92",
  rule: "rgba(11,11,11,0.08)",
  accent: "#B02A2A",
};

export const DISCO_THEME: UiPreviewTheme = {
  name: "disco",
  defaultTone: "#141414",

  // ── Palette ─────────────────────────────────────────────────────────
  bg: colors.bg, // warm cream paper
  surface: colors.surface,
  ink: colors.ink,
  muted: colors.muted,
  faint: colors.faint,
  rule: colors.rule,
  accent: colors.accent, // editorial red — "live now" moment

  // ── Type ────────────────────────────────────────────────────────────
  // Font-family strings pointing at the Google Fonts variants loaded in the
  // root layout. We pick the weight/italic by choosing the right key.
  fonts,

  // Semantic text slots. Components should prefer these over composing
  // `fonts` + colors directly so another theme can fully restyle each role.
  text: {
    homeLeagueTag: {
      fontFamily: fonts.serifItalic,
      fontSize: 11,
      letterSpacing: 1.8,
      textTransform: "uppercase",
      color: colors.muted,
    },
    homePageTitle: {
      fontFamily: fonts.sansBold,
      fontSize: 34,
      lineHeight: 36,
      letterSpacing: -1.2,
      color: colors.ink,
    },
    avatarInitial: {
      fontFamily: fonts.sansBold,
      fontSize: 11,
      color: "#fff",
    },
    homeLiveLabel: {
      fontFamily: fonts.sansBold,
      fontSize: 11,
      letterSpacing: 1.4,
      textTransform: "uppercase",
      color: colors.accent,
    },
    homeHeroPrompt: {
      fontFamily: fonts.serifItalic,
      fontSize: 32,
      lineHeight: 34,
      letterSpacing: -0.6,
      color: colors.ink,
    },
    homeHeroDescriptor: {
      fontFamily: fonts.sansMedium,
      fontSize: 12,
      color: colors.muted,
    },
    liveBadgeText: {
      fontFamily: fonts.sansBold,
      fontSize: 10,
      letterSpacing: 1,
      textTransform: "uppercase",
      color: colors.ink,
    },
    homeHeroPhase: {
      fontFamily: fonts.sansSemi,
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: "uppercase",
      color: "rgba(255,255,255,0.9)",
    },
    homeHeroCta: {
      fontFamily: fonts.serifMedium,
      fontSize: 20,
      lineHeight: 22,
      letterSpacing: -0.3,
      color: "#fff",
    },
    sectionTitle: {
      fontFamily: fonts.sansBold,
      fontSize: 22,
      letterSpacing: -0.6,
      color: colors.ink,
    },
    sectionMeta: {
      fontFamily: fonts.sansMedium,
      fontSize: 12,
      color: colors.muted,
    },
    playlistTilePrompt: {
      fontFamily: fonts.serifMedium,
      fontSize: 14,
      lineHeight: 17,
      letterSpacing: -0.1,
      color: colors.ink,
    },
    playlistTileMeta: {
      fontFamily: fonts.sansMedium,
      fontSize: 11,
      color: colors.muted,
    },
    seasonsLabel: {
      fontFamily: fonts.sansBold,
      fontSize: 11,
      letterSpacing: 1.6,
      textTransform: "uppercase",
      color: colors.muted,
    },
    seasonIconLetter: {
      fontFamily: fonts.serifMediumItalic,
      fontSize: 18,
      color: "#fff",
    },
    seasonName: {
      fontFamily: fonts.sansSemi,
      fontSize: 15,
      color: colors.ink,
    },
    seasonStatus: {
      fontFamily: fonts.sansMedium,
      fontSize: 11,
      color: colors.muted,
    },
    seasonArrow: {
      fontFamily: fonts.serifItalic,
      fontSize: 18,
      color: colors.faint,
    },
    nowPlayingTitle: {
      fontFamily: fonts.sansSemi,
      fontSize: 14,
      color: colors.ink,
    },
    nowPlayingArtist: {
      fontFamily: fonts.sansMedium,
      fontSize: 12,
      color: colors.muted,
    },
    tabLabel: {
      fontFamily: fonts.sansSemi,
      fontSize: 10,
      letterSpacing: 0.2,
    },
    detailChromeGlyph: {
      fontFamily: fonts.sansSemi,
      fontSize: 24,
      color: colors.ink,
    },
    detailActionPillGlyph: {
      fontFamily: fonts.sansMedium,
      fontSize: 20,
      lineHeight: 22,
      color: colors.ink,
    },
    detailActionPillDots: {
      fontFamily: fonts.sansSemi,
      fontSize: 18,
      color: colors.ink,
    },
    detailTitle: {
      fontFamily: fonts.serifMediumItalic,
      fontSize: 28,
      lineHeight: 32,
      letterSpacing: -0.4,
      color: "#fff",
      textAlign: "center",
      textShadowColor: "rgba(0,0,0,0.35)",
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 8,
    },
    detailSubtitle: {
      fontFamily: fonts.sansSemi,
      fontSize: 15,
      color: "rgba(255,255,255,0.9)",
      textAlign: "center",
      textShadowColor: "rgba(0,0,0,0.35)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 6,
    },
    detailMeta: {
      fontFamily: fonts.sansMedium,
      fontSize: 12,
      color: "rgba(255,255,255,0.78)",
      textAlign: "center",
      textShadowColor: "rgba(0,0,0,0.35)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 6,
    },
    detailActionButtonLabel: {
      fontFamily: fonts.sansSemi,
      fontSize: 15,
      color: "#fff",
    },
    detailShuffleGlyph: {
      fontFamily: fonts.sansBold,
      fontSize: 18,
      color: "#fff",
    },
    detailDescription: {
      fontFamily: fonts.sansMedium,
      fontSize: 13,
      lineHeight: 19,
      color: "#000",
    },
    trackTitle: {
      fontFamily: fonts.sansSemi,
      fontSize: 15,
      color: colors.ink,
    },
    trackArtist: {
      fontFamily: fonts.sansMedium,
      fontSize: 12,
      color: colors.muted,
    },
    trackMore: {
      fontFamily: fonts.sansBold,
      fontSize: 16,
      color: colors.muted,
    },
    helperText: {
      fontFamily: fonts.serifItalic,
      fontSize: 8,
      color: "#fff",
    },
  },

  // ── Round Artwork ───────────────────────────────────────────────────
  // Each key can be passed through nav params. Home/detail screens look up
  // the image, tone, and optional video from the active theme.
  rounds: {
    "disco-balloon": {
      image: require("../../../../assets/images/rounds/Disco-Hero-Tall.png"),
      tone: "#c48f1a",
      video: require("../../../../assets/videos/rounds/Disco-Balloon.mp4"),
    },
    "disco-encrusted": {
      image: require("../../../../assets/images/rounds/Disco-Encrusted.jpeg"),
      tone: "#8d2c5c",
    },
    "disco-knot": {
      image: require("../../../../assets/images/rounds/Disco-Knot.png"),
      tone: "#d48a22",
    },
    "disco-scene": {
      image: require("../../../../assets/images/rounds/Disco-Scene.png"),
      tone: "#7a2f68",
    },
    "disco-string": {
      image: require("../../../../assets/images/rounds/Disco-String-Header.png"),
      tone: "#4d3a70",
    },
  },
};
