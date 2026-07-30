import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { ChromeText } from "@/ui/ChromeText";

export type FittedChromeTitleProps = {
  text: string;
  textStyle: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  maxStarSize: number;
  starGap?: number;
};

const FULL_SIZE_LENGTH = 10;
const WRAP_LENGTH = 15;
const MINIMUM_SCALE = 0.72;

function wrapTitle(text: string): string[] {
  const lines: string[] = [];
  let line = "";

  for (const word of text.trim().split(/\s+/)) {
    const chunks = Array.from(word.matchAll(new RegExp(`.{1,${WRAP_LENGTH}}`, "g")), (match) => match[0]);

    for (const chunk of chunks) {
      const candidate = line ? `${line} ${chunk}` : chunk;
      if (candidate.length <= WRAP_LENGTH) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = chunk;
      }
    }
  }

  if (line) lines.push(line);
  return lines;
}

function fontScaleForLength(length: number): number {
  if (length <= FULL_SIZE_LENGTH) return 1;
  if (length >= WRAP_LENGTH) return MINIMUM_SCALE;

  const progress = (length - FULL_SIZE_LENGTH) / (WRAP_LENGTH - FULL_SIZE_LENGTH);
  return 1 - progress * (1 - MINIMUM_SCALE);
}

export function FittedChromeTitle({
  text,
  textStyle,
  style,
  maxStarSize,
  starGap = 6,
}: FittedChromeTitleProps) {
  const lines = wrapTitle(text);
  const flattenedTextStyle = StyleSheet.flatten(textStyle);

  return (
    <View style={[styles.root, style]}>
      {lines.map((line, index) => {
        const isFinalLine = index === lines.length - 1;
        // The final line shares horizontal space with the chrome star, so
        // include it in the same character budget as the title text.
        const effectiveLength = line.length + (isFinalLine ? 2 : 0);
        const scale = fontScaleForLength(effectiveLength);
        const scaledTextStyle: TextStyle = {
          fontSize:
            typeof flattenedTextStyle.fontSize === "number"
              ? flattenedTextStyle.fontSize * scale
              : undefined,
          lineHeight:
            typeof flattenedTextStyle.lineHeight === "number"
              ? flattenedTextStyle.lineHeight * scale
              : undefined,
          letterSpacing:
            typeof flattenedTextStyle.letterSpacing === "number"
              ? flattenedTextStyle.letterSpacing * scale
              : undefined,
        };
        return (
          <View key={`${index}-${line}`} style={styles.line}>
            <Text
              style={[textStyle, styles.lineText, scaledTextStyle]}
              numberOfLines={1}
            >
              {line}
            </Text>
            {isFinalLine ? (
              <ChromeText
                glyph="★"
                size={maxStarSize}
                style={[styles.accent, { marginLeft: starGap }]}
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
    width: "100%",
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  lineText: {
    flexShrink: 1,
    minWidth: 0,
  },
  accent: {
    flexShrink: 0,
  },
});
