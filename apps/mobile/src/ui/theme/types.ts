import type { TextStyle } from "react-native";

export type RoundAsset = {
  image: string;  // Supabase Storage URL
  tone: string;
  video?: number; // local bundled video (mp4 via require()) until videos are in Storage
};

export type UiPreviewTextStyles = {
  homeLeagueTag: TextStyle;
  homePageTitle: TextStyle;
  avatarInitial: TextStyle;
  homeLiveLabel: TextStyle;
  homeHeroPrompt: TextStyle;
  homeHeroDescriptor: TextStyle;
  liveBadgeText: TextStyle;
  homeHeroPhase: TextStyle;
  homeHeroCta: TextStyle;
  sectionTitle: TextStyle;
  sectionMeta: TextStyle;
  playlistTilePrompt: TextStyle;
  playlistTileMeta: TextStyle;
  seasonsLabel: TextStyle;
  seasonIconLetter: TextStyle;
  seasonName: TextStyle;
  seasonStatus: TextStyle;
  seasonArrow: TextStyle;
  nowPlayingTitle: TextStyle;
  nowPlayingArtist: TextStyle;
  tabLabel: TextStyle;
  detailChromeGlyph: TextStyle;
  detailActionPillGlyph: TextStyle;
  detailActionPillDots: TextStyle;
  detailTitle: TextStyle;
  detailSubtitle: TextStyle;
  detailMeta: TextStyle;
  detailActionButtonLabel: TextStyle;
  detailShuffleGlyph: TextStyle;
  detailDescription: TextStyle;
  trackTitle: TextStyle;
  trackArtist: TextStyle;
  trackMore: TextStyle;
  helperText: TextStyle;
};

export type MixTheme = {
  name: string;
  defaultTone: string;

  bg: string;
  surface: string;
  ink: string;
  muted: string;
  faint: string;
  rule: string;
  accent: string;

  fonts: {
    serifRegular: string;
    serifItalic: string;
    serifMedium: string;
    serifMediumItalic: string;
    serifBold: string;
    sans: string;
    sansMedium: string;
    sansSemi: string;
    sansBold: string;
    monoBold: string;
    monoExtraBold: string;
  };

  // Page-wide wallpaper image (Supabase Storage URL). Themes without a
  // wallpaper render the flat `bg` color instead.
  wallpaper?: string;

  // Chrome palette for borders / glyph fills. Approximated in RN as solid
  // colors + shadow until a proper MaskedView + LinearGradient pipeline
  // lands. See `ui/ChromeText.tsx`.
  chrome: {
    base: string;     // mid-tone silver for solid fills
    highlight: string; // bright reflection
    shadow: string;   // dark recess
    border: string;   // single-color border approximation
  };

  text: UiPreviewTextStyles;
  rounds: Record<string, RoundAsset>;
};

// Back-compat alias so the preview keeps working without churn.
export type UiPreviewTheme = MixTheme;
