export const colors = {
  // Brand
  brand: "#1DB954",
  brandFaint: "#1DB95422",
  brandMid: "#1DB95466",

  // Backgrounds
  bgPrimary: "#000",
  bgDeep: "#0a0a0a",
  bgSheet: "#050505",
  bgCard: "#111",
  bgCardDark: "#0d0d0d",

  // Surfaces (layered elevation)
  surface1: "#111",
  surface2: "#1a1a1a",
  surface3: "#222",
  surface4: "#2a2a2a",
  surface5: "#333",

  // Borders
  border: "#222",
  borderSubtle: "#1a1a1a",
  borderFaint: "#1e1e1e",
  borderStrong: "#333",
  borderInput: "#2a2a2a",

  // Text
  textPrimary: "#fff",
  textSecondary: "#888",
  textMuted: "#555",
  textDim: "#444",
  textFaint: "#333",
  textLabel: "#666",
  textLight: "#ccc",
  textMid: "#bbb",
  textSubtle: "#777",
  textBright: "#ddd",

  // Semantic — status/medals
  gold: "#FFD700",
  goldFaint: "#FFD70022",
  goldMid: "#FFD70044",
  goldMuted: "#FFD70099",
  silver: "#C0C0C0",
  bronze: "#CD7F32",
  amber: "#f0a500",
  amberFaint: "#f0a50033",
  amberMuted: "#f0a50099",
  purple: "#9b59b6",
  purpleFaint: "#9b59b633",
  purpleMuted: "#9b59b699",
  danger: "#c0392b",

  // Tinted backgrounds (brand/status overlays)
  bgBrandTint: "#0f1a12",
  bgBrandTintDeep: "#0a1f10",
  bgGoldTint: "#1a1400",
  bgGoldTintAlt: "#14100a",
  bgAmberTint: "#1a0a00",
  bgPurpleTint: "#0d0d1a",
  bgStatusDone: "#33333388",
} as const;

// ─── Nocturne palette ─────────────────────────────────────────────────────────
// Dark, sophisticated, ambient. "Midnight" blue is the default theme.
export const nocturne = {
  // Backgrounds
  bg: "#080C18",
  bg2: "#162043",

  // Accent palette — blue-forward
  blue: "#5CADE8",
  blueLight: "#7BC8FF",
  gold: "#E8C855",
  mint: "#7BE8C0",
  rose: "#FF8AA8",

  // Status colors (round / phase)
  completed: "#E8C855",
  active: "#5CADE8",
  upcoming: "rgba(255,255,255,0.10)",

  // Cards / Glass
  card: "rgba(255,255,255,0.05)",
  cardBorder: "rgba(255,255,255,0.08)",
  cardRadius: 22,

  // Text
  ink: "#F4EEE4",
  inkMuted: "rgba(244,238,228,0.55)",
  inkFaint: "rgba(244,238,228,0.35)",

  // Tab bar
  tabGlass: "rgba(255,255,255,0.04)",
  tabBorder: "rgba(255,255,255,0.10)",

  // Gradient arrays (for LinearGradient)
  bgGradient: ["#162043", "#080C18", "#000000"] as const,
  mixPuck: ["#2E88E0", "#5CB0F8"] as const,
} as const;
