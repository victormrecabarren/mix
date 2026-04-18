import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Alert,
} from 'react-native';
import { KeyboardScroll } from '@/components/KeyboardScroll';
import { RefreshScroll } from '@/components/RefreshHeader';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';

type Season = {
  id: string;
  name: string;
  season_number: number;
  status: string;
  league_id: string;
  submissions_per_user: number;
  default_points_per_round: number;
  default_max_points_per_track: number;
  leagues: { id: string; name: string; admin_user_id: string } | null;
};

type Round = {
  id: string;
  round_number: number;
  prompt: string;
  description: string;
  submission_deadline_at: string;
  voting_deadline_at: string;
};

type Member = {
  user_id: string;
  role: string;
  display_name: string;
};

function getRoundEffectiveStatus(rounds: Round[], index: number): { label: string; color: string; isActive: boolean } {
  const now = Date.now();
  const isCompleted = (r: Round) => now >= new Date(r.voting_deadline_at).getTime();

  const prevCompleted = index === 0 || isCompleted(rounds[index - 1]);
  if (!prevCompleted) return { label: 'UPCOMING', color: '#444', isActive: false };

  const round = rounds[index];
  const subDeadline = new Date(round.submission_deadline_at).getTime();
  const voteDeadline = new Date(round.voting_deadline_at).getTime();
  if (now < subDeadline) return { label: 'SUBMISSIONS OPEN', color: '#1DB954', isActive: true };
  if (now < voteDeadline) return { label: 'VOTING OPEN', color: '#f0a500', isActive: true };
  return { label: 'COMPLETED', color: '#555', isActive: false };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatDateTime(date: Date) {
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

// ─── Avatar stack ─────────────────────────────────────────────────────────────

const MAX_AVATARS = 4;

function AvatarStack({ members, label, color }: {
  members: Member[];
  label: string;
  color: string;
}) {
  const shown = members.slice(0, MAX_AVATARS);
  const overflow = members.length - shown.length;
  return (
    <View style={styles.avatarStackRow}>
      <Text style={[styles.avatarStackLabel, { color }]}>
        {label} ({members.length})
      </Text>
      <View style={styles.avatarStackAvatars}>
        {shown.map((m, i) => (
          <View
            key={m.user_id}
            style={[styles.avatarStackBubble, { marginLeft: i === 0 ? 0 : -8, zIndex: MAX_AVATARS - i }]}
          >
            <Text style={styles.avatarStackInitial}>{m.display_name[0]?.toUpperCase() ?? '?'}</Text>
          </View>
        ))}
        {overflow > 0 && (
          <View style={[styles.avatarStackBubble, styles.avatarStackOverflow, { marginLeft: -8 }]}>
            <Text style={styles.avatarStackOverflowText}>+{overflow}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Shared subcomponents ─────────────────────────────────────────────────────

function Stepper({ value, onChange, min = 1, max = 100 }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <View style={styles.stepper}>
      <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
        <Text style={[styles.stepBtnTxt, value <= min && { opacity: 0.25 }]}>−</Text>
      </TouchableOpacity>
      <Text style={styles.stepVal}>{value}</Text>
      <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>
        <Text style={[styles.stepBtnTxt, value >= max && { opacity: 0.25 }]}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

function DateTimeField({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState(value);
  return (
    <>
      <TouchableOpacity style={styles.dateField} onPress={() => { setTemp(value); setOpen(true); }}>
        <Text style={styles.dateFieldText}>{formatDateTime(value)}</Text>
        <Text style={styles.dateFieldIcon}>⏰</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerToolbar}>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={styles.pickerCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { onChange(temp); setOpen(false); }}>
                <Text style={styles.pickerDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <RNDateTimePicker
              value={temp}
              mode="datetime"
              display="spinner"
              onValueChange={(_, d) => d && setTemp(d)}
              onDismiss={() => setOpen(false)}
              themeVariant="dark"
              textColor="#fff"
              style={{ width: '100%' }}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Season edit modal ────────────────────────────────────────────────────────

type SeasonEditForm = {
  name: string;
  submissionsPerUser: number;
  pointsPerRound: number;
  maxPerTrack: number;
};

function SeasonEditModal({ season, visible, onClose, onSaved }: {
  season: Season;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<SeasonEditForm>({
    name: season.name,
    submissionsPerUser: season.submissions_per_user,
    pointsPerRound: season.default_points_per_round,
    maxPerTrack: season.default_max_points_per_track,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) { Alert.alert('Name required'); return; }
    setSaving(true);
    const { error } = await supabase.from('seasons').update({
      name: form.name.trim(),
      submissions_per_user: form.submissionsPerUser,
      default_points_per_round: form.pointsPerRound,
      default_max_points_per_track: form.maxPerTrack,
    }).eq('id', season.id);
    setSaving(false);
    if (error) { Alert.alert('Save failed', error.message); return; }
    onSaved();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Season</Text>
            <TouchableOpacity onPress={save} disabled={saving}>
              <Text style={[styles.modalSave, saving && { opacity: 0.4 }]}>Save</Text>
            </TouchableOpacity>
          </View>

          <KeyboardScroll contentContainerStyle={styles.modalBody}>
            <Text style={styles.fieldLabel}>SEASON NAME</Text>
            <TextInput
              style={styles.modalInput}
              value={form.name}
              onChangeText={(name) => setForm((f) => ({ ...f, name }))}
              placeholderTextColor="#555"
              autoFocus
            />

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>SUBMISSIONS PER ROUND</Text>
            <Text style={styles.fieldHint}>How many tracks each player submits per round</Text>
            <View style={styles.stepperRow}>
              <Stepper value={form.submissionsPerUser} onChange={(v) => setForm((f) => ({ ...f, submissionsPerUser: v }))} min={1} max={10} />
              <Text style={styles.stepperUnit}>{form.submissionsPerUser === 1 ? 'track' : 'tracks'}</Text>
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>POINTS PER ROUND</Text>
            <Text style={styles.fieldHint}>Total points each player distributes per round</Text>
            <View style={styles.stepperRow}>
              <Stepper value={form.pointsPerRound} onChange={(v) => setForm((f) => ({ ...f, pointsPerRound: v, maxPerTrack: Math.min(f.maxPerTrack, v) }))} min={1} max={100} />
              <Text style={styles.stepperUnit}>pts</Text>
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>MAX PER TRACK</Text>
            <Text style={styles.fieldHint}>Maximum a single track can receive from one voter</Text>
            <View style={styles.stepperRow}>
              <Stepper value={form.maxPerTrack} onChange={(v) => setForm((f) => ({ ...f, maxPerTrack: v }))} min={1} max={form.pointsPerRound} />
              <Text style={styles.stepperUnit}>pts</Text>
            </View>
          </KeyboardScroll>
        </View>
      </View>
    </Modal>
  );
}

// ─── Round edit modal ─────────────────────────────────────────────────────────

type RoundEditForm = {
  prompt: string;
  description: string;
  submissionDeadline: Date;
  votingDeadline: Date;
};

function RoundEditModal({ round, visible, onClose, onSaved }: {
  round: Round;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<RoundEditForm>({
    prompt: round.prompt,
    description: round.description,
    submissionDeadline: new Date(round.submission_deadline_at),
    votingDeadline: new Date(round.voting_deadline_at),
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.prompt.trim()) { Alert.alert('Prompt required'); return; }
    if (!form.description.trim()) { Alert.alert('Description required'); return; }
    setSaving(true);
    const { error } = await supabase.from('rounds').update({
      prompt: form.prompt.trim(),
      description: form.description.trim(),
      submission_deadline_at: form.submissionDeadline.toISOString(),
      voting_deadline_at: form.votingDeadline.toISOString(),
    }).eq('id', round.id);
    setSaving(false);
    if (error) { Alert.alert('Save failed', error.message); return; }
    onSaved();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Round {round.round_number}</Text>
            <TouchableOpacity onPress={save} disabled={saving}>
              <Text style={[styles.modalSave, saving && { opacity: 0.4 }]}>Save</Text>
            </TouchableOpacity>
          </View>

          <KeyboardScroll contentContainerStyle={styles.modalBody}>
            <Text style={styles.fieldLabel}>PROMPT</Text>
            <TextInput
              style={[styles.modalInput, { minHeight: 72, textAlignVertical: 'top' }]}
              value={form.prompt}
              onChangeText={(prompt) => setForm((f) => ({ ...f, prompt }))}
              multiline
              placeholderTextColor="#555"
              autoFocus
            />

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>DESCRIPTION</Text>
            <TextInput
              style={[styles.modalInput, { minHeight: 72, textAlignVertical: 'top' }]}
              value={form.description}
              onChangeText={(description) => setForm((f) => ({ ...f, description }))}
              multiline
              placeholderTextColor="#555"
            />

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>SUBMISSION DEADLINE</Text>
            <DateTimeField value={form.submissionDeadline} onChange={(d) => setForm((f) => ({ ...f, submissionDeadline: d }))} />

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>VOTING DEADLINE</Text>
            <DateTimeField value={form.votingDeadline} onChange={(d) => setForm((f) => ({ ...f, votingDeadline: d }))} />
          </KeyboardScroll>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

type Tab = 'rounds' | 'members';

export function SeasonScreen({ seasonId, leagueId }: { seasonId: string; leagueId?: string }) {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [submittersByRound, setSubmittersByRound] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('rounds');

  const [editingSeasonOpen, setEditingSeasonOpen] = useState(false);
  const [editingRound, setEditingRound] = useState<Round | null>(null);

  const fetchData = useCallback(async () => {
    const [{ data: { user } }, { data: rawSeasonData }] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from('seasons')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select('id, name, season_number, status, league_id, submissions_per_user, default_points_per_round, default_max_points_per_track, leagues(id, name, admin_user_id)' as any)
        .eq('id', seasonId)
        .single(),
    ]);

    setUserId(user?.id ?? null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seasonData = rawSeasonData as any as (Season & { leagues: any }) | null;

    if (!seasonData) { setLoading(false); return; }

    const league = Array.isArray(seasonData.leagues) ? seasonData.leagues[0] : seasonData.leagues;

    const [{ data: roundsData }, { data: membersData }] = await Promise.all([
      supabase
        .from('rounds')
        .select('id, round_number, prompt, description, submission_deadline_at, voting_deadline_at')
        .eq('season_id', seasonId)
        .order('round_number', { ascending: true }),
      supabase
        .from('league_members')
        .select('user_id, role, users(display_name)')
        .eq('league_id', seasonData.league_id)
        .order('joined_at', { ascending: true }),
    ]);

    const roundIds = (roundsData ?? []).map((r) => r.id);
    const { data: subsData } = roundIds.length > 0
      ? await supabase.from('submissions').select('round_id, user_id').in('round_id', roundIds)
      : { data: [] };

    // Build map: roundId → unique user_ids who submitted
    const byRound: Record<string, string[]> = {};
    for (const sub of (subsData ?? [])) {
      if (!byRound[sub.round_id]) byRound[sub.round_id] = [];
      if (!byRound[sub.round_id].includes(sub.user_id)) byRound[sub.round_id].push(sub.user_id);
    }

    setSeason({ ...seasonData, leagues: league ?? null });
    setRounds(roundsData ?? []);
    setSubmittersByRound(byRound);
    setMembers(
      (membersData ?? []).map((m) => ({
        user_id: m.user_id,
        role: m.role,
        display_name:
          (Array.isArray(m.users)
            ? m.users[0]?.display_name
            : (m.users as { display_name: string } | null)?.display_name) ?? 'Unknown',
      })),
    );
    setLoading(false);
  }, [seasonId]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const isCommissioner = season?.leagues?.admin_user_id === userId;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#555" />
      </View>
    );
  }

  if (!season) {
    return (
      <View style={styles.centered}>
        <Text style={styles.mutedText}>Season not found.</Text>
      </View>
    );
  }

  const league = season.leagues;

  return (
    <>
      <RefreshScroll
        contentContainerStyle={styles.root}
        style={{ backgroundColor: '#000' }}
        onRefresh={fetchData}
      >
        {/* ── Season header ── */}
        <View style={styles.titleRow}>
          <Text style={styles.pageTitle}>{season.name}</Text>
          <View style={[styles.statusBadge, season.status === 'active' ? styles.statusActive : styles.statusDone]}>
            <Text style={styles.statusText}>{season.status.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.seasonMeta}>Season {season.season_number}</Text>
        {isCommissioner && (
          <TouchableOpacity onPress={() => setEditingSeasonOpen(true)}>
            <Text style={styles.editBtn}>Edit Season</Text>
          </TouchableOpacity>
        )}

        {/* ── Tab switcher ── */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'rounds' && styles.tabBtnActive]}
            onPress={() => setTab('rounds')}
          >
            <Text style={[styles.tabBtnText, tab === 'rounds' && styles.tabBtnTextActive]}>
              Rounds
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'members' && styles.tabBtnActive]}
            onPress={() => setTab('members')}
          >
            <Text style={[styles.tabBtnText, tab === 'members' && styles.tabBtnTextActive]}>
              Members ({members.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Rounds tab ── */}
        {tab === 'rounds' && (
          <View style={styles.section}>
            {rounds.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No rounds yet.</Text>
              </View>
            ) : (
              rounds.map((round, index) => {
                const { label, color, isActive } = getRoundEffectiveStatus(rounds, index);
                const submittedIds = submittersByRound[round.id] ?? [];
                const submittedMembers = members.filter((m) => submittedIds.includes(m.user_id));
                const waitingMembers = members.filter((m) => !submittedIds.includes(m.user_id));

                return (
                  <TouchableOpacity
                    key={round.id}
                    style={styles.roundCard}
                    activeOpacity={0.7}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onPress={() => router.push({ pathname: '/(tabs)/(stack)/round/[id]' as any, params: { id: round.id, seasonId } })}
                  >
                    <View style={styles.roundHeader}>
                      <Text style={styles.roundNumber}>Round {round.round_number}</Text>
                      <View style={styles.roundHeaderRight}>
                        <Text style={[styles.roundStatus, { color }]}>{label}</Text>
                        {isCommissioner && (
                          <TouchableOpacity
                            onPress={(e) => { e.stopPropagation(); setEditingRound(round); }}
                            style={styles.roundEditBtn}
                          >
                            <Text style={styles.roundEditBtnText}>Edit</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    <Text style={styles.roundPrompt}>{round.prompt}</Text>
                    {!!round.description && <Text style={styles.roundDescription}>{round.description}</Text>}

                    {/* Submission status — only shown on active rounds */}
                    {isActive && (
                      <View style={styles.submissionStatus}>
                        <AvatarStack members={submittedMembers} label="Submitted" color="#1DB954" />
                        {waitingMembers.length > 0 && (
                          <AvatarStack members={waitingMembers} label="Waiting" color="#555" />
                        )}
                      </View>
                    )}

                    <View style={styles.roundDates}>
                      <Text style={styles.dateLabel}>Subs due <Text style={styles.dateValue}>{formatDate(round.submission_deadline_at)}</Text></Text>
                      <Text style={styles.dateLabel}>Votes due <Text style={styles.dateValue}>{formatDate(round.voting_deadline_at)}</Text></Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* ── Members tab ── */}
        {tab === 'members' && (
          <View style={styles.section}>
            {members.map((m) => (
              <View key={m.user_id} style={styles.memberRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{m.display_name[0]?.toUpperCase() ?? '?'}</Text>
                </View>
                <Text style={styles.memberName}>{m.display_name}</Text>
                <View style={styles.memberBadges}>
                  {m.user_id === league?.admin_user_id && (
                    <Text style={styles.commBadge}>COMM</Text>
                  )}
                  <Text style={[styles.roleBadge, m.role === 'spectator' && styles.roleBadgeSpectator]}>
                    {m.role.toUpperCase()}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </RefreshScroll>

      {/* ── Season edit modal ── */}
      {isCommissioner && (
        <SeasonEditModal
          season={season}
          visible={editingSeasonOpen}
          onClose={() => setEditingSeasonOpen(false)}
          onSaved={fetchData}
        />
      )}

      {/* ── Round edit modal ── */}
      {isCommissioner && editingRound && (
        <RoundEditModal
          round={editingRound}
          visible={editingRound !== null}
          onClose={() => setEditingRound(null)}
          onSaved={fetchData}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  mutedText: { color: '#555', fontSize: 15 },

  root: { backgroundColor: '#000', padding: 24, paddingBottom: 48, gap: 20 },
  editBtn: { fontSize: 13, color: '#888', fontWeight: '600' },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: '#fff', flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusActive: { backgroundColor: '#1DB95422' },
  statusDone: { backgroundColor: '#33333388' },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: '#1DB954' },
  seasonMeta: { fontSize: 13, color: '#555', marginTop: -12 },

  // Tab bar
  tabBar: { flexDirection: 'row', backgroundColor: '#111', borderRadius: 10, padding: 3, gap: 3 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#1a1a1a' },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: '#555' },
  tabBtnTextActive: { color: '#fff' },

  section: { gap: 12 },

  empty: { paddingVertical: 24, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#444' },

  roundCard: { backgroundColor: '#111', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#222', gap: 8 },
  roundHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roundHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roundNumber: { fontSize: 13, fontWeight: '800', color: '#fff' },
  roundStatus: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  roundEditBtn: { backgroundColor: '#1a1a1a', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#2a2a2a' },
  roundEditBtnText: { fontSize: 11, color: '#888', fontWeight: '600' },
  roundPrompt: { fontSize: 15, color: '#ccc', lineHeight: 20, fontWeight: '700' },
  roundDescription: { fontSize: 13, color: '#777', lineHeight: 18, marginTop: -2 },
  roundDates: { gap: 2, marginTop: 4 },
  dateLabel: { fontSize: 11, color: '#555' },
  dateValue: { color: '#888' },

  // Submission status on active round cards
  submissionStatus: { gap: 6, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#1a1a1a', marginTop: 2 },
  avatarStackRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarStackLabel: { fontSize: 11, fontWeight: '700', width: 90 },
  avatarStackAvatars: { flexDirection: 'row', alignItems: 'center' },
  avatarStackBubble: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#2a2a2a', borderWidth: 1.5, borderColor: '#111', alignItems: 'center', justifyContent: 'center' },
  avatarStackInitial: { fontSize: 10, fontWeight: '700', color: '#fff' },
  avatarStackOverflow: { backgroundColor: '#222' },
  avatarStackOverflowText: { fontSize: 9, fontWeight: '700', color: '#888' },

  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  memberName: { flex: 1, fontSize: 15, color: '#fff', fontWeight: '500' },
  memberBadges: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  commBadge: { fontSize: 9, fontWeight: '800', color: '#1DB954', letterSpacing: 1 },
  roleBadge: { fontSize: 9, fontWeight: '700', color: '#555', letterSpacing: 1 },
  roleBadgeSpectator: { color: '#444' },

  // Stepper
  stepper: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  stepBtn: { width: 44, height: 44, backgroundColor: '#111', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  stepBtnTxt: { fontSize: 22, color: '#fff', fontWeight: '300' },
  stepVal: { minWidth: 52, textAlign: 'center', fontSize: 20, fontWeight: '700', color: '#fff' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  stepperUnit: { fontSize: 14, color: '#555' },

  // Date picker
  dateField: { backgroundColor: '#111', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#2a2a2a', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  dateFieldText: { fontSize: 15, color: '#fff' },
  dateFieldIcon: { fontSize: 16 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 32 },
  pickerToolbar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  pickerCancel: { fontSize: 15, color: '#888' },
  pickerDone: { fontSize: 15, color: '#1DB954', fontWeight: '700' },

  // Edit modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#0d0d0d', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  modalTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  modalCancel: { fontSize: 15, color: '#888' },
  modalSave: { fontSize: 15, color: '#1DB954', fontWeight: '700' },
  modalBody: { padding: 20, paddingBottom: 48, gap: 4 },
  modalInput: { backgroundColor: '#111', borderRadius: 10, padding: 14, fontSize: 15, color: '#fff', borderWidth: 1, borderColor: '#2a2a2a', marginTop: 8 },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: '#555', letterSpacing: 1.2, textTransform: 'uppercase' },
  fieldHint: { fontSize: 11, color: '#444', marginTop: 2 },
});
