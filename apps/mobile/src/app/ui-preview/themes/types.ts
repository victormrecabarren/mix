import type { TextStyle } from "react-native";

export type RoundAsset = {
  image: number;
  tone: string;
  video?: number;
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

export type UiPreviewTheme = {
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
  };

  text: UiPreviewTextStyles;
  rounds: Record<string, RoundAsset>;
};
