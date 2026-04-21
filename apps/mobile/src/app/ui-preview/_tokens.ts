// TEMP: V1 Archive design tokens — mirrors the palette + type system from
// `mix - Playlist-first directions` (v1-archive direction). Kept inline
// under ui-preview so we can experiment without polluting a shared theme.

export const v1 = {
  // ── Palette ─────────────────────────────────────────────────────────
  bg: "#F6F1E8", // warm cream paper
  surface: "#FFFFFF",
  ink: "#0B0B0B",
  muted: "#6B6257",
  faint: "#A69D92",
  rule: "rgba(11,11,11,0.08)",
  accent: "#B02A2A", // editorial red — "live now" moment

  // ── Type ────────────────────────────────────────────────────────────
  // Font-family strings pointing at the Google Fonts variants loaded in the
  // root layout. We pick the weight/italic by choosing the right key.
  fonts: {
    serifRegular: "Fraunces_400Regular",
    serifItalic: "Fraunces_400Regular_Italic",
    serifMedium: "Fraunces_500Medium",
    serifMediumItalic: "Fraunces_500Medium_Italic",
    serifBold: "Fraunces_700Bold",
    sans: "InterTight_400Regular",
    sansMedium: "InterTight_500Medium",
    sansSemi: "InterTight_600SemiBold",
    sansBold: "InterTight_700Bold",
  },
};
