// TEMP: preview category detail. Opened via standard iOS push/pop slide.

import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function CategoryDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]}>
        <View style={styles.topBar}>
          <Pressable
            style={styles.circleBtn}
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Text style={styles.circleBtnText}>‹</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>{id}</Text>
        <Text style={styles.muted}>
          This screen pushes in with the native iOS slide animation.
          The playlist tiles on the home use a formSheet presentation instead.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  topBar: { paddingHorizontal: 16, paddingTop: 8 },
  circleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f2f2f2",
    alignItems: "center",
    justifyContent: "center",
  },
  circleBtnText: { fontSize: 22, color: "#000", marginTop: -2 },

  body: { padding: 24, gap: 16 },
  title: { fontSize: 32, fontWeight: "800", color: "#000" },
  muted: { fontSize: 14, color: "#666", lineHeight: 20 },
});
