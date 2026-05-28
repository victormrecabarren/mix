import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { ChromeText } from "@/ui/ChromeText";

// Walk a StyleProp and pull out the most-specific fontSize (later styles
// win, mirroring RN's own style cascade). Used to size the optical-center
// nudge for the chrome star inline with the title — scaling per-title-size
// rather than per-star-size means submissions (74pt) and home (52pt) both
// land on the optical midline of italic Fraunces caps.
function extractFontSize(style: StyleProp<TextStyle>): number | undefined {
  if (!style) return undefined;
  if (Array.isArray(style)) {
    for (let i = style.length - 1; i >= 0; i--) {
      const fs = extractFontSize(style[i] as StyleProp<TextStyle>);
      if (fs !== undefined) return fs;
    }
    return undefined;
  }
  const s = style as TextStyle;
  return typeof s.fontSize === "number" ? s.fontSize : undefined;
}

export type FittedChromeTitleProps = {
  text: string;
  textStyle: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  minimumFontScale?: number;
  maxStarSize: number;
  starGap?: number;
  lineOverlap?: number;
};

function splitMidpoint(text: string): string[] {
  const trimmed = text.trim();
  const spaces = [...trimmed.matchAll(/\s+/g)];
  if (spaces.length === 0) return [trimmed];

  const midpoint = trimmed.length / 2;
  const split = spaces.reduce((best, match) => {
    const index = match.index ?? 0;
    return Math.abs(index - midpoint) < Math.abs(best - midpoint)
      ? index
      : best;
  }, spaces[0].index ?? 0);

  return [trimmed.slice(0, split), trimmed.slice(split).trim()].filter(Boolean);
}

export function FittedChromeTitle({
  text,
  textStyle,
  style,
  minimumFontScale = 0.5,
  maxStarSize,
  starGap = 6,
  lineOverlap = -10,
}: FittedChromeTitleProps) {
  const lines = splitMidpoint(text);
  const titleFontSize = extractFontSize(textStyle);
  // Italic Fraunces caps sit visually below the geometric line-box center
  // — the ascender + slant pull the bbox up further than the descender
  // pulls it down. To land the chrome star on the optical midline of the
  // caps, shift it down by ~12% of the *title's* fontSize (so 74pt title
  // gets ~9pt, 52pt title gets ~6pt). Fall back to a star-size scale if
  // the text style doesn't expose a fontSize.
  const starMarginTop = titleFontSize
    ? titleFontSize * 0.12
    : maxStarSize * 0.18;

  return (
    <View style={[styles.root, style]}>
      {lines.map((line, index) => {
        const hasAccent = index === lines.length - 1;
        return (
          <View
            key={`${index}-${line}`}
            style={[styles.line, index > 0 ? { marginTop: lineOverlap } : null]}
          >
            <Text
              style={[textStyle, styles.lineText]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={minimumFontScale}
            >
              {line}
            </Text>
            {hasAccent ? (
              <ChromeText
                glyph="★"
                size={maxStarSize}
                style={[
                  styles.accent,
                  { marginLeft: starGap, marginTop: starMarginTop },
                ]}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    alignItems: "center",
    overflow: "visible",
  },
  line: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  lineText: {
    flexShrink: 1,
    minWidth: 0,
    width: "auto",
  },
  accent: {
    flexShrink: 0,
  },
});
