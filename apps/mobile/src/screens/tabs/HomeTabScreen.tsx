import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSession } from '@/context/SessionContext';

// ─── Placeholder sections ─────────────────────────────────────────────────────
// This screen will show: active league scoreboard, current round playlist link,
// round timeline (past + future weeks), and upcoming prompts with dates.

function PlaceholderCard({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{description}</Text>
    </View>
  );
}

export function HomeTabScreen() {
  const { session, signOut } = useSession();

  return (
    <ScrollView contentContainerStyle={styles.root} style={{ backgroundColor: '#000' }}>
      <View style={styles.header}>
        <View>
          <Text style={styles.heading}>Home</Text>
          {session && (
            <Text style={styles.subheading}>Hey, {session.displayName}</Text>
          )}
        </View>
        {session && (
          <TouchableOpacity onPress={() => void signOut()} style={styles.signOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        )}
      </View>

      <PlaceholderCard
        title="League Standings"
        description="Scoreboard with points leaders for the current season will appear here."
      />

      <PlaceholderCard
        title="This Week's Round"
        description="Active round prompt, submission deadline, and a link to the voting playlist."
      />

      <PlaceholderCard
        title="Round Timeline"
        description="Past rounds with results and upcoming rounds with prompts and dates."
      />

      <PlaceholderCard
        title="Upcoming Prompts"
        description="Future round prompts so you can start thinking ahead."
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#000',
    padding: 24,
    paddingTop: 56,
    paddingBottom: 48,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  heading: { fontSize: 28, fontWeight: '800', color: '#fff' },
  subheading: { fontSize: 14, color: '#666', marginTop: 2 },
  signOut: { paddingVertical: 6, paddingHorizontal: 2 },
  signOutText: { fontSize: 13, color: '#555' },

  card: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: '#222',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  cardBody: { fontSize: 13, color: '#555', lineHeight: 18 },
});
