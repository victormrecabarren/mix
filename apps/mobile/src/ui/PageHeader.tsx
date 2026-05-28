// Page header strip: small editorial league tag on top, big page title
// below, optional avatar stack and a trailing render slot for screen-
// specific chrome (commissioner buttons, settings glyph, etc.).

import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { THEME } from "@/ui/theme";
import {
  AvatarStack,
  type AvatarParticipant,
} from "@/ui/sections/AvatarStack";

export type PageHeaderProps = {
  leagueTag?: string;
  title: string;
  participants?: AvatarParticipant[];
  trailing?: ReactNode;
};

export function PageHeader({
  leagueTag,
  title,
  participants,
  trailing,
}: PageHeaderProps) {
  const hasParticipants = participants && participants.length > 0;
  return (
    <View style={styles.header}>
      <View style={styles.left}>
        {leagueTag ? <Text style={styles.leagueTag}>{leagueTag}</Text> : null}
        <Text style={[styles.pageTitle, leagueTag ? styles.pageTitleSpacing : null]}>
          {title}
        </Text>
      </View>
      {hasParticipants ? <AvatarStack participants={participants!} /> : null}
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
    fontStyle: "italic",
  },
  pageTitleSpacing: {
    marginTop: 4,
  },
});
