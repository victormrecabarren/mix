import type { MixTheme } from "./types";

// Bubblegum · Halftone — SOPHIE × Barbie × Charli XCX energy.
// Hot-pink halftone wallpaper, chunky italic Fraunces display, chrome glyphs
// (★ ✦ ♥ +) and borders, matte plum-black bottom nav. The page IS the color
// story — not a neutral canvas.
//
// Design handoff: see Claude Design's Bubblegum spec (Nov 2026).

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
  monoBold: "JetBrainsMono_700Bold",
  monoExtraBold: "JetBrainsMono_800ExtraBold",
};

const colors = {
  // surfaces
  bgPage: "#FF2E9A",       // hot pink wallpaper
  bgPageDot: "#FFC6E3",    // halftone dot color (lives in the wallpaper image)
  bgPaper: "#FFD9EC",      // primary card surface (baby pink)
  bgPaperMono: "#FFE9F4",  // lighter card surface

  // ink
  ink: "#1A0814",          // near-black plum
  inkMuted: "#A8186E",     // deep magenta secondary
  inkFaint: "#FF85C2",     // faded tertiary
  rule: "rgba(26,8,20,0.14)",

  // accents
  accent: "#C4FF3D",       // acid lime — "the opposite pop". On Bubblegum
                            // it's replaced by chrome for glyphs/fills.
  accentSoft: "#FFF14A",   // yellow secondary

  // nav
  navBg: "#1A0814",
  navInk: "#FFD9EC",
  navAccent: "#FFFFFF",
};

export const BUBBLEGUM_THEME: MixTheme = {
  name: "bubblegum",
  defaultTone: "#1A0814",

  // Wallpaper image — full-bleed pink halftone. Upload `bubblegum-bg.png` to
  // the same Supabase bucket as the disco assets.
  wallpaper:
    "https://dmkxaqhmcbrzqnpnpicx.supabase.co/storage/v1/object/public/mix%20theme%20assets/Themes/DiscoBalloon/bubblegum-bg.png",

  bg: colors.bgPage,
  surface: colors.bgPaper,
  ink: colors.ink,
  muted: colors.inkMuted,
  faint: colors.inkFaint,
  rule: colors.rule,
  accent: colors.accent,

  chrome: {
    base: "#cfcfcf",
    highlight: "#f8f8f8",
    shadow: "#888888",
    border: "#bdbdbd",
  },

  fonts,

  text: {
    homeLeagueTag: {
      fontFamily: fonts.monoBold,
      fontSize: 10,
      letterSpacing: 1.8,
      textTransform: "uppercase",
      color: colors.ink,
    },
    homePageTitle: {
      fontFamily: fonts.serifBold,
      fontStyle: "italic",
      fontSize: 48,
      lineHeight: 50,
      letterSpacing: -1.8,
      color: colors.ink,
    },
    avatarInitial: {
      fontFamily: fonts.sansBold,
      fontSize: 11,
      color: colors.ink,
    },
    homeLiveLabel: {
      fontFamily: fonts.monoBold,
      fontSize: 10,
      letterSpacing: 1.6,
      textTransform: "uppercase",
      color: colors.ink,
    },
    homeHeroPrompt: {
      fontFamily: fonts.serifBold,
      fontStyle: "italic",
      fontSize: 52,
      lineHeight: 50,
      letterSpacing: -2.2,
      color: colors.ink,
    },
    homeHeroDescriptor: {
      fontFamily: fonts.sansMedium,
      fontSize: 12,
      color: colors.ink,
    },
    liveBadgeText: {
      fontFamily: fonts.monoBold,
      fontSize: 10,
      letterSpacing: 1.6,
      textTransform: "uppercase",
      color: colors.ink,
    },
    homeHeroPhase: {
      fontFamily: fonts.monoBold,
      fontSize: 10,
      letterSpacing: 1.6,
      textTransform: "uppercase",
      color: colors.ink,
    },
    homeHeroCta: {
      fontFamily: fonts.serifMediumItalic,
      fontSize: 20,
      lineHeight: 22,
      letterSpacing: -0.3,
      color: colors.ink,
    },
    sectionTitle: {
      fontFamily: fonts.serifBold,
      fontStyle: "italic",
      fontSize: 22,
      letterSpacing: -0.6,
      color: colors.ink,
    },
    sectionMeta: {
      fontFamily: fonts.sansMedium,
      fontSize: 12,
      color: colors.ink,
    },
    playlistTilePrompt: {
      fontFamily: fonts.serifMediumItalic,
      fontSize: 15,
      lineHeight: 17,
      letterSpacing: -0.2,
      color: colors.ink,
    },
    playlistTileMeta: {
      fontFamily: fonts.monoBold,
      fontSize: 9.5,
      letterSpacing: 1.4,
      textTransform: "uppercase",
      color: colors.ink,
    },
    seasonsLabel: {
      fontFamily: fonts.monoBold,
      fontSize: 10,
      letterSpacing: 1.8,
      textTransform: "uppercase",
      color: colors.ink,
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
      color: colors.ink,
    },
    seasonArrow: {
      fontFamily: fonts.serifItalic,
      fontSize: 18,
      color: colors.inkFaint,
    },
    nowPlayingTitle: {
      fontFamily: fonts.sansSemi,
      fontSize: 14,
      color: colors.ink,
    },
    nowPlayingArtist: {
      fontFamily: fonts.sansMedium,
      fontSize: 12,
      color: colors.inkMuted,
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
      fontFamily: fonts.serifBold,
      fontStyle: "italic",
      fontSize: 34,
      lineHeight: 36,
      letterSpacing: -1,
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
    },
    detailMeta: {
      fontFamily: fonts.monoBold,
      fontSize: 10,
      letterSpacing: 1.6,
      textTransform: "uppercase",
      color: "rgba(255,255,255,0.85)",
      textAlign: "center",
    },
    detailActionButtonLabel: {
      fontFamily: fonts.sansSemi,
      fontSize: 15,
      color: colors.ink,
    },
    detailShuffleGlyph: {
      fontFamily: fonts.sansBold,
      fontSize: 18,
      color: colors.ink,
    },
    detailDescription: {
      fontFamily: fonts.sansMedium,
      fontSize: 13,
      lineHeight: 19,
      color: colors.ink,
    },
    trackTitle: {
      fontFamily: fonts.serifBold,
      fontStyle: "italic",
      fontSize: 17,
      letterSpacing: -0.3,
      color: colors.ink,
    },
    trackArtist: {
      fontFamily: fonts.sansMedium,
      fontSize: 12,
      color: colors.inkMuted,
    },
    trackMore: {
      fontFamily: fonts.sansBold,
      fontSize: 16,
      color: colors.inkMuted,
    },
    helperText: {
      fontFamily: fonts.serifItalic,
      fontSize: 11,
      color: colors.ink,
    },
  },

  // Reuse the disco round artwork until Bubblegum-specific round covers
  // exist in Supabase. The wallpaper supplies the per-theme visual identity;
  // round covers are still per-round. Keys listed in COVER_KEYS rotate by
  // round number; extra keys are fixed artwork for specific surfaces.
  rounds: {
    "disco-balloon-hero": {
      image:
        "https://dmkxaqhmcbrzqnpnpicx.supabase.co/storage/v1/object/public/mix%20theme%20assets/Themes/DiscoBalloon/Disco-Balloon-Hero.jpg",
      tone: "#e83a9b",
      // Local mp4 — same asset that powered the original ui-preview Motion
      // Artwork POC. Plays muted+looping over the still image.
      video: require("../../../assets/videos/rounds/Disco-Balloon.mp4"),
    },
    "disco-encrusted": {
      image:
        "https://dmkxaqhmcbrzqnpnpicx.supabase.co/storage/v1/object/public/mix%20theme%20assets/Themes/DiscoBalloon/Disco-Encrusted.jpeg",
      tone: "#8d2c5c",
    },
    "disco-knot": {
      image:
        "https://dmkxaqhmcbrzqnpnpicx.supabase.co/storage/v1/object/public/mix%20theme%20assets/Themes/DiscoBalloon/Disco-Knot.jpg",
      tone: "#d48a22",
    },
    "disco-scene": {
      image:
        "https://dmkxaqhmcbrzqnpnpicx.supabase.co/storage/v1/object/public/mix%20theme%20assets/Themes/DiscoBalloon/Disco-Scene.jpg",
      tone: "#7a2f68",
    },
    "disco-string": {
      image:
        "https://dmkxaqhmcbrzqnpnpicx.supabase.co/storage/v1/object/public/mix%20theme%20assets/Themes/DiscoBalloon/Disco-String.jpeg",
      tone: "#4d3a70",
    },
  },
};
