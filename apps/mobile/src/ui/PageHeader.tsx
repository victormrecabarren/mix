// Page header strip: small editorial league tag on top, big page title
// below, optional avatar stack and a trailing render slot for screen-
// specific chrome (commissioner buttons, settings glyph, etc.).

import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { THEME } from "@/ui/theme";

export type PageHeaderProps = {
  leagueTag?: string;
  title: string;
  trailing?: ReactNode;
};

export function PageHeader({
  leagueTag,
  title,
  trailing,
}: PageHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.left}>
        {leagueTag ? <Text style={styles.leagueTag}>{leagueTag}</Text> : null}
        <Text numberOfLines={1} style={[styles.pageTitle, leagueTag ? styles.pageTitleSpacing : null]}>
          {title}
        </Text>
      </View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 8,
  },
  left: { flex: 1 },
  leagueTag: {
    ...THEME.text.homeLeagueTag,
  },
  pageTitle: {
    ...THEME.text.homePageTitle,
  },
  pageTitleSpacing: {
    marginTop: 4,
  },
});
