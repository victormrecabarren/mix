import { StyleSheet, Text, View } from 'react-native';
import { THEME } from '@/ui/theme/tokens';

export default function ActivityPage() {
  return (
    <View style={styles.root}>
      <Text style={styles.text}>Activity</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg, alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: THEME.fonts.sansSemi, fontSize: 18, color: THEME.ink },
});
