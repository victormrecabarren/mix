import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  RefreshControl, ScrollView, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardScroll } from '@/components/KeyboardScroll'; // used inside modals only
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { Stack, useRouter, useFocusEffect, useNavigation } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, nocturne } from '@/theme/colors';
import { fonts } from '@/theme/fonts';
import { GlassCard } from '@/components/nocturne/GlassCard';
import { Eyebrow } from '@/components/nocturne/Eyebrow';
import { Chip } from '@/components/nocturne/Chip';
import { useSeason as useSeasonQuery, useRounds as useRoundsQuery } from '@/queries/season';

function formatTimeLeftShort(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'closing';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

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

type StandingRow = {
  user_id: string;
  display_name: string;
  total_points: number;
  rounds_played: number;
  rounds_forfeited: number;
  member_role: string;
};

function withStandingsRanks(rows: StandingRow[]): (StandingRow & { displayRank: number })[] {
  let rank = 1;
  return rows.map((row, i) => {
    if (i > 0 && row.total_points < rows[i - 1].total_points) {
      rank = i + 1;
    }
    return { ...row, displayRank: rank };
  });
}

type RoundStage = 'upcoming' | 'submissions' | 'voting' | 'completed';

function getRoundEffectiveStatus(rounds: Round[], index: number): { label: string; color: string; isActive: boolean; stage: RoundStage } {
  const now = Date.now();
  const isCompleted = (r: Round) => now >= new Date(r.voting_deadline_at).getTime();

  const prevCompleted = index === 0 || isCompleted(rounds[index - 1]);
  if (!prevCompleted) return { label: 'UPCOMING', color: colors.textDim, isActive: false, stage: 'upcoming' };

  const round = rounds[index];
  const subDeadline = new Date(round.submission_deadline_at).getTime();
  const voteDeadline = new Date(round.voting_deadline_at).getTime();
  if (now < subDeadline) return { label: 'SUBMISSIONS OPEN', color: colors.brand, isActive: true, stage: 'submissions' };
  if (now < voteDeadline) return { label: 'VOTING OPEN', color: colors.amber, isActive: true, stage: 'voting' };
  return { label: 'COMPLETED', color: colors.textMuted, isActive: false, stage: 'completed' };
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
              textColor={colors.textPrimary}
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
              placeholderTextColor={colors.textMuted}
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

// ─── Round form modal (create + edit) ────────────────────────────────────────

type RoundFormValues = {
  prompt: string;
  description: string;
  submissionDeadline: Date;
  votingDeadline: Date;
};

type RoundFormMode =
  | { kind: 'edit'; round: Round }
  | { kind: 'create'; seasonId: string; nextRoundNumber: number };

function defaultCreateForm(): RoundFormValues {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  return {
    prompt: '',
    description: '',
    submissionDeadline: new Date(now + 7 * DAY),
    votingDeadline: new Date(now + 10 * DAY),
  };
}

function RoundFormModal({ mode, visible, onClose, onSaved }: {
  mode: RoundFormMode;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<RoundFormValues>(
    mode.kind === 'edit'
      ? {
          prompt: mode.round.prompt,
          description: mode.round.description,
          submissionDeadline: new Date(mode.round.submission_deadline_at),
          votingDeadline: new Date(mode.round.voting_deadline_at),
        }
      : defaultCreateForm(),
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.prompt.trim()) { Alert.alert('Prompt required'); return; }
    if (!form.description.trim()) { Alert.alert('Description required'); return; }
    if (form.votingDeadline.getTime() <= form.submissionDeadline.getTime()) {
      Alert.alert('Voting deadline must be after submission deadline'); return;
    }

    setSaving(true);
    const { error } = mode.kind === 'edit'
      ? await supabase.from('rounds').update({
          prompt: form.prompt.trim(),
          description: form.description.trim(),
          submission_deadline_at: form.submissionDeadline.toISOString(),
          voting_deadline_at: form.votingDeadline.toISOString(),
        }).eq('id', mode.round.id)
      : await supabase.from('rounds').insert({
          season_id: mode.seasonId,
          round_number: mode.nextRoundNumber,
          prompt: form.prompt.trim(),
          description: form.description.trim(),
          submission_deadline_at: form.submissionDeadline.toISOString(),
          voting_deadline_at: form.votingDeadline.toISOString(),
        });
    setSaving(false);
    if (error) {
      Alert.alert(mode.kind === 'edit' ? 'Save failed' : 'Create failed', error.message);
      return;
    }
    onSaved();
    onClose();
  };

  const title = mode.kind === 'edit'
    ? `Edit Round ${mode.round.round_number}`
    : `New Round ${mode.nextRoundNumber}`;
  const ctaLabel = mode.kind === 'edit' ? 'Save' : 'Create';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={save} disabled={saving}>
              <Text style={[styles.modalSave, saving && { opacity: 0.4 }]}>{ctaLabel}</Text>
            </TouchableOpacity>
          </View>

          <KeyboardScroll contentContainerStyle={styles.modalBody}>
            <Text style={styles.fieldLabel}>PROMPT</Text>
            <TextInput
              style={[styles.modalInput, { minHeight: 72, textAlignVertical: 'top' }]}
              value={form.prompt}
              onChangeText={(prompt) => setForm((f) => ({ ...f, prompt }))}
              multiline
              placeholder="e.g. Songs that feel like summer"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>DESCRIPTION</Text>
            <TextInput
              style={[styles.modalInput, { minHeight: 72, textAlignVertical: 'top' }]}
              value={form.description}
              onChangeText={(description) => setForm((f) => ({ ...f, description }))}
              multiline
              placeholder="Extra context or rules for the round"
              placeholderTextColor={colors.textMuted}
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

type Tab = 'rounds' | 'standings';

export function SeasonScreen({
  seasonId,
  initialTab,
  initialName,
  initialNumber,
  initialStatus,
  initialLeagueName,
}: {
  seasonId: string;
  initialTab?: Tab;
  initialName?: string;
  initialNumber?: number;
  initialStatus?: string;
  initialLeagueName?: string;
}) {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // Primary queries — hit react-query cache instantly if pre-seeded by LeagueScreen
  const { data: seasonFromQuery } = useSeasonQuery(seasonId);
  const { data: roundsFromQuery = [] } = useRoundsQuery(seasonId);

  const [userId, setUserId] = useState<string | null>(null);
  // `season` is derived from query; kept as a local variable for backward compat with existing render code
  const season = (seasonFromQuery as Season | null | undefined) ?? null;
  const rounds = roundsFromQuery as Round[];
  const [members, setMembers] = useState<Member[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [submittersByRound, setSubmittersByRound] = useState<Record<string, string[]>>({});
  const [votersByRound, setVotersByRound] = useState<Record<string, string[]>>({});
  const [forfeitsByRound, setForfeitsByRound] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(!season);
  const [tab, setTab] = useState<Tab>(initialTab ?? 'rounds');

  const [editingSeasonOpen, setEditingSeasonOpen] = useState(false);
  const [editingRound, setEditingRound] = useState<Round | null>(null);
  const [creatingRound, setCreatingRound] = useState(false);

  // Fetches the "extra" data not covered by primary useSeason/useRounds queries:
  // members, standings, submitters/voters/forfeits maps. This runs independently
  // so the header/rounds list renders immediately from cache.
  const fetchExtraData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);

    if (!season) return;

    const [{ data: membersData }, standingsRes] = await Promise.all([
      supabase
        .from('league_members')
        .select('user_id, role, users(display_name)')
        .eq('league_id', season.league_id)
        .order('joined_at', { ascending: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.rpc as any)('get_season_standings', { p_season_id: seasonId }),
    ]);

    const roundIds = rounds.map((r) => r.id);
    const [
      { data: subsData },
      { data: votesData },
      { data: participantsData },
    ] = roundIds.length > 0
      ? await Promise.all([
          supabase.from('submissions').select('round_id, user_id').in('round_id', roundIds),
          supabase.from('votes').select('round_id, voter_user_id').in('round_id', roundIds),
          supabase.from('round_participants').select('round_id, is_void').in('round_id', roundIds),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

    const byRound: Record<string, string[]> = {};
    for (const sub of (subsData ?? [])) {
      if (!byRound[sub.round_id]) byRound[sub.round_id] = [];
      if (!byRound[sub.round_id].includes(sub.user_id)) byRound[sub.round_id].push(sub.user_id);
    }

    const votersBy: Record<string, string[]> = {};
    for (const v of (votesData ?? [])) {
      if (!votersBy[v.round_id]) votersBy[v.round_id] = [];
      if (!votersBy[v.round_id].includes(v.voter_user_id)) votersBy[v.round_id].push(v.voter_user_id);
    }

    const forfeitsBy: Record<string, number> = {};
    for (const p of (participantsData ?? [])) {
      if (p.is_void) forfeitsBy[p.round_id] = (forfeitsBy[p.round_id] ?? 0) + 1;
    }

    setSubmittersByRound(byRound);
    setVotersByRound(votersBy);
    setForfeitsByRound(forfeitsBy);
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sr = standingsRes as any;
    if (sr.error) {
      console.warn('get_season_standings:', sr.error.message);
      setStandings([]);
    } else {
      setStandings(Array.isArray(sr.data) ? sr.data : []);
    }

    setLoading(false);
  }, [seasonId, season, rounds]);

  // Mark loading=false once we have the minimum required data for render
  useEffect(() => {
    if (season) setLoading(false);
  }, [season]);

  // Alias for backward compatibility — any code calling fetchData (e.g., modal
  // onSaved callbacks) now triggers the extra-data refetch + query invalidation
  const fetchData = fetchExtraData;

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const sortedByRoundNumber = useMemo(
    () => [...rounds].sort((a, b) => a.round_number - b.round_number),
    [rounds],
  );

  const statusByRoundId = useMemo(() => {
    const m: Record<string, { label: string; color: string; isActive: boolean; stage: RoundStage }> = {};
    sortedByRoundNumber.forEach((round, index) => {
      m[round.id] = getRoundEffectiveStatus(sortedByRoundNumber, index);
    });
    return m;
  }, [sortedByRoundNumber]);

  const incompleteRounds = useMemo(
    () =>
      sortedByRoundNumber
        .filter((r) => statusByRoundId[r.id]?.stage !== 'completed')
        .sort((a, b) => {
          const aSt = statusByRoundId[a.id];
          const bSt = statusByRoundId[b.id];
          const aActive = aSt?.isActive === true;
          const bActive = bSt?.isActive === true;
          if (aActive !== bActive) return aActive ? -1 : 1;
          return b.round_number - a.round_number;
        }),
    [sortedByRoundNumber, statusByRoundId],
  );

  const completedRounds = useMemo(
    () =>
      sortedByRoundNumber
        .filter((r) => statusByRoundId[r.id]?.stage === 'completed')
        .sort((a, b) => b.round_number - a.round_number),
    [sortedByRoundNumber, statusByRoundId],
  );

  const standingsWithRank = useMemo(() => withStandingsRanks(standings), [standings]);

  const isCommissioner = season?.leagues?.admin_user_id === userId;

  // If we have NO initial data AND are still loading AND have nothing fetched yet,
  // show a tiny transparent spinner. Otherwise render the UI with whatever we have
  // (from params if fetch hasn't completed). This keeps the transition smooth:
  // the header renders instantly from route params and content fills in as it loads.
  if (loading && !season && !initialName) {
    return (
      <View style={nocStyles.transparentCentered}>
        <ActivityIndicator color={nocturne.blue} />
      </View>
    );
  }

  if (!loading && !season) {
    return (
      <View style={nocStyles.transparentCentered}>
        <Text style={{ color: nocturne.inkMuted, fontFamily: fonts.sans, fontSize: 15 }}>
          Season not found.
        </Text>
      </View>
    );
  }

  // Use params as fallback for header values while season data loads
  const displayName = season?.name ?? initialName ?? '';
  const displayNumber = season?.season_number ?? initialNumber ?? 0;
  const displayStatus = season?.status ?? initialStatus ?? 'active';

  const league = season?.leagues ?? null;

  // Nocturne-style active round card — glass, chip, round number, prompt, time left
  const renderActiveRoundCard = (round: Round) => {
    const st = statusByRoundId[round.id];
    const stage = st?.stage ?? 'upcoming';
    const isVoting = stage === 'voting';
    const isSubmissions = stage === 'submissions';
    const chipColor = isVoting ? nocturne.active : nocturne.mint;
    const chipLabel = isVoting ? 'Voting open' : isSubmissions ? 'Submissions open' : 'Upcoming';
    const deadline = isVoting ? round.voting_deadline_at : round.submission_deadline_at;
    const timeLeft = stage === 'upcoming'
      ? 'opens soon'
      : `${formatTimeLeftShort(deadline)} left`;
    const borderColor = isVoting ? nocturne.active + '55' : nocturne.cardBorder;

    return (
      <TouchableOpacity
        key={round.id}
        activeOpacity={0.85}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onPress={() => router.push({ pathname: '/(tabs)/(home)/round/[id]' as any, params: { id: round.id, seasonId } })}
      >
        <GlassCard style={{ borderColor }}>
          <View style={nocStyles.activeRoundRow}>
            <Chip label={chipLabel} color={chipColor} />
            <Text style={nocStyles.roundNumberBadge}>R{String(round.round_number).padStart(2, '0')}</Text>
          </View>
          <Text style={nocStyles.roundPrompt}>{round.prompt}</Text>
          <Text style={nocStyles.roundTimeLeft}>{timeLeft}</Text>
          {isCommissioner && stage !== 'completed' && (
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); setEditingRound(round); }}
              style={nocStyles.roundEditBtn}
            >
              <Text style={nocStyles.roundEditBtnText}>Edit</Text>
            </TouchableOpacity>
          )}
        </GlassCard>
      </TouchableOpacity>
    );
  };

  // Completed round — list row with R-number, prompt, chevron
  const renderCompletedRoundRow = (round: Round) => (
    <TouchableOpacity
      key={round.id}
      activeOpacity={0.6}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onPress={() => router.push({ pathname: '/(tabs)/(home)/round/[id]' as any, params: { id: round.id, seasonId } })}
      style={nocStyles.completedRow}
    >
      <Text style={nocStyles.completedNumber}>R{String(round.round_number).padStart(2, '0')}</Text>
      <View style={nocStyles.completedBody}>
        <Text style={nocStyles.completedPrompt} numberOfLines={2}>{round.prompt}</Text>
      </View>
      <Text style={nocStyles.completedChev}>›</Text>
    </TouchableOpacity>
  );

  const renderRoundCard = (round: Round) => {
    const st = statusByRoundId[round.id];
    const { label, color, isActive, stage } = st ?? {
      label: '—',
      color: colors.textMuted,
      isActive: false,
      stage: 'completed' as RoundStage,
    };
    const activeIds = stage === 'voting'
      ? (votersByRound[round.id] ?? [])
      : (submittersByRound[round.id] ?? []);
    const participants = members.filter((m) => m.role !== 'spectator');
    const doneMembers = participants.filter((m) => activeIds.includes(m.user_id));
    const waitingMembers = participants.filter((m) => !activeIds.includes(m.user_id));
    const doneLabel = stage === 'voting' ? 'Voted' : 'Submitted';
    const forfeitCount = forfeitsByRound[round.id] ?? 0;

    return (
      <TouchableOpacity
        key={round.id}
        style={styles.roundCard}
        activeOpacity={0.7}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onPress={() => router.push({ pathname: '/(tabs)/(home)/round/[id]' as any, params: { id: round.id, seasonId } })}
      >
        <View style={styles.roundHeader}>
          <Text style={styles.roundNumber}>Round {round.round_number}</Text>
          <View style={styles.roundHeaderRight}>
            <Text style={[styles.roundStatus, { color }]}>{label}</Text>
            {isCommissioner && stage !== 'completed' && (
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

        {isActive && (
          <View style={styles.submissionStatus}>
            <AvatarStack members={doneMembers} label={doneLabel} color={stage === 'voting' ? colors.amber : colors.brand} />
            {waitingMembers.length > 0 && (
              <AvatarStack members={waitingMembers} label="Waiting" color={colors.textMuted} />
            )}
          </View>
        )}

        {stage === 'completed' && forfeitCount > 0 && (
          <Text style={styles.forfeitFootnote}>
            {forfeitCount} {forfeitCount === 1 ? 'forfeit' : 'forfeits'} · non-voters lost their points
          </Text>
        )}

        <View style={styles.roundDates}>
          <Text style={styles.dateLabel}>Subs due <Text style={styles.dateValue}>{formatDate(round.submission_deadline_at)}</Text></Text>
          <Text style={styles.dateLabel}>Votes due <Text style={styles.dateValue}>{formatDate(round.voting_deadline_at)}</Text></Text>
        </View>
      </TouchableOpacity>
    );
  };

  // Ascending sort for progress math (R01..R06)
  const roundsAsc = [...rounds].sort((a, b) => a.round_number - b.round_number);
  const completedCountAsc = roundsAsc.filter((r) => {
    const st = statusByRoundId[r.id];
    return st?.stage === 'completed';
  }).length;
  const totalRounds = roundsAsc.length;

  const statusChipColor =
    displayStatus === 'active' ? nocturne.gold : displayStatus === 'completed' ? nocturne.blueLight : nocturne.inkMuted;
  const statusChipLabel =
    displayStatus === 'active' ? 'IN PROGRESS' : displayStatus === 'completed' ? 'COMPLETED' : displayStatus.toUpperCase();
  const displayLeagueName = league?.name ?? initialLeagueName ?? '';

  // Set the header title synchronously before paint — avoids the momentary
  // "Season" default flashing before the league name appears.
  useLayoutEffect(() => {
    navigation.setOptions({
      title: displayLeagueName.toUpperCase() || 'SEASON',
      headerTitleStyle: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 12,
        color: nocturne.inkMuted,
      },
      headerTitleAlign: 'center',
    });
  }, [navigation, displayLeagueName]);

  return (
    <View style={nocStyles.screenRoot}>
      <ScrollView
        contentContainerStyle={[nocStyles.root, { paddingTop: insets.top + 56 }]}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={nocturne.blue} />}
      >
        {/* ── Season header ── */}
        <Eyebrow>
          {totalRounds > 0
            ? `Season · ${completedCountAsc}/${totalRounds} rounds`
            : `Season ${displayNumber || ''}`}
        </Eyebrow>
        <Text style={nocStyles.pageTitle}>
          {displayName}
          <Text style={{ color: nocturne.blueLight }}>.</Text>
        </Text>
        <Text style={[nocStyles.statusLabel, { color: statusChipColor }]}>
          {statusChipLabel}
        </Text>
        {isCommissioner && displayStatus !== 'completed' && (
          <TouchableOpacity onPress={() => setEditingSeasonOpen(true)}>
            <Text style={nocStyles.editBtn}>Edit Season</Text>
          </TouchableOpacity>
        )}

        {/* ── Tab switcher — kept but styled compact ── */}
        <View style={nocStyles.tabBar}>
          <TouchableOpacity
            style={[nocStyles.tabBtn, tab === 'rounds' && nocStyles.tabBtnActive]}
            onPress={() => setTab('rounds')}
          >
            <Text style={[nocStyles.tabBtnText, tab === 'rounds' && nocStyles.tabBtnTextActive]}>
              Rounds
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[nocStyles.tabBtn, tab === 'standings' && nocStyles.tabBtnActive]}
            onPress={() => setTab('standings')}
          >
            <Text style={[nocStyles.tabBtnText, tab === 'standings' && nocStyles.tabBtnTextActive]}>
              Standings
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Rounds tab ── */}
        {tab === 'rounds' && (
          <View style={nocStyles.section}>
            {rounds.length === 0 ? (
              <View style={nocStyles.empty}>
                <Text style={nocStyles.emptyText}>No rounds yet.</Text>
              </View>
            ) : (
              <>
                {/* Active rounds as glass cards */}
                {incompleteRounds.map((round) => renderActiveRoundCard(round))}

                {/* Completed section */}
                {completedRounds.length > 0 && (
                  <>
                    <View style={nocStyles.completedDivider}>
                      <View style={nocStyles.completedDividerLine} />
                      <Text style={nocStyles.completedDividerLabel}>COMPLETED</Text>
                      <View style={nocStyles.completedDividerLine} />
                    </View>
                    <View style={nocStyles.completedList}>
                      {completedRounds.map((round) => renderCompletedRoundRow(round))}
                    </View>
                  </>
                )}
              </>
            )}

            {isCommissioner && displayStatus === 'active' && (
              <TouchableOpacity
                style={nocStyles.addRoundBtn}
                onPress={() => setCreatingRound(true)}
                activeOpacity={0.7}
              >
                <Text style={nocStyles.addRoundBtnIcon}>+</Text>
                <Text style={nocStyles.addRoundBtnText}>Add Round</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Standings tab (points from rounds whose voting has ended only) ── */}
        {tab === 'standings' && (
          <View style={styles.section}>
            <Text style={styles.standingsHint}>
              Totals include completed rounds only — they update after each round&apos;s voting deadline passes.
            </Text>
            {(() => {
              const participants = standingsWithRank.filter((r) => r.member_role !== 'spectator');
              const spectators = standingsWithRank.filter((r) => r.member_role === 'spectator');
              return (
                <>
                  {participants.length === 0 ? (
                    <View style={styles.empty}>
                      <Text style={styles.emptyText}>No standings yet.</Text>
                    </View>
                  ) : (
                    participants.map((row) => (
                      <View key={row.user_id} style={styles.standingRow}>
                        <Text style={styles.standingRank}>{row.displayRank}</Text>
                        <View style={styles.avatar}>
                          <Text style={styles.avatarText}>{row.display_name[0]?.toUpperCase() ?? '?'}</Text>
                        </View>
                        <View style={styles.standingMeta}>
                          <Text style={styles.standingName} numberOfLines={1}>{row.display_name}</Text>
                          {(row.rounds_played > 0 || row.rounds_forfeited > 0) && (
                            <Text style={styles.standingSub}>
                              {row.rounds_played} {row.rounds_played === 1 ? 'round' : 'rounds'} played
                              {row.rounds_forfeited > 0
                                ? ` · ${row.rounds_forfeited} forfeit${row.rounds_forfeited === 1 ? '' : 's'}`
                                : ''}
                            </Text>
                          )}
                        </View>
                        {row.user_id === league?.admin_user_id && (
                          <Text style={styles.commBadge}>COMM</Text>
                        )}
                        <Text style={styles.standingPts}>{row.total_points}</Text>
                      </View>
                    ))
                  )}

                  {spectators.length > 0 && (
                    <View style={styles.spectatorSection}>
                      <Text style={styles.spectatorSectionTitle}>SPECTATORS</Text>
                      {spectators.map((row) => (
                        <View key={row.user_id} style={styles.spectatorRow}>
                          <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{row.display_name[0]?.toUpperCase() ?? '?'}</Text>
                          </View>
                          <Text style={styles.spectatorName} numberOfLines={1}>{row.display_name}</Text>
                          {row.user_id === league?.admin_user_id && (
                            <Text style={styles.commBadge}>COMM</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </>
              );
            })()}
          </View>
        )}
      </ScrollView>

      {/* ── Season edit modal ── */}
      {isCommissioner && season && (
        <SeasonEditModal
          season={season}
          visible={editingSeasonOpen}
          onClose={() => setEditingSeasonOpen(false)}
          onSaved={fetchData}
        />
      )}

      {/* ── Round edit modal ── */}
      {isCommissioner && editingRound && (
        <RoundFormModal
          mode={{ kind: 'edit', round: editingRound }}
          visible={editingRound !== null}
          onClose={() => setEditingRound(null)}
          onSaved={fetchData}
        />
      )}

      {/* ── Round create modal ── */}
      {isCommissioner && creatingRound && season && (
        <RoundFormModal
          mode={{
            kind: 'create',
            seasonId: season.id,
            nextRoundNumber: (rounds[rounds.length - 1]?.round_number ?? 0) + 1,
          }}
          visible={creatingRound}
          onClose={() => setCreatingRound(false)}
          onSaved={fetchData}
        />
      )}
    </View>
  );
}

// Nocturne-scoped styles for the redesigned Season screen
const nocStyles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: 'transparent' },
  transparentCentered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  root: {
    padding: 22,
    paddingBottom: 140,
    gap: 12,
  },
  pageTitle: {
    fontFamily: fonts.serifBlack,
    fontSize: 36,
    color: nocturne.ink,
    letterSpacing: -0.8,
    lineHeight: 40,
    marginTop: 2,
  },
  statusLabel: {
    fontSize: 11,
    fontFamily: fonts.sansSemiBold,
    letterSpacing: 1.6,
    marginTop: 4,
    marginBottom: 6,
  },
  editBtn: {
    fontSize: 13,
    color: nocturne.inkMuted,
    fontFamily: fonts.sansMedium,
    marginBottom: 2,
  },
  // Compact tab segmented control
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 3,
    gap: 3,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  tabBtnActive: { backgroundColor: 'rgba(255,255,255,0.08)' },
  tabBtnText: {
    fontSize: 12,
    fontFamily: fonts.sansMedium,
    color: nocturne.inkMuted,
  },
  tabBtnTextActive: { color: nocturne.ink, fontFamily: fonts.sansSemiBold },

  section: { gap: 10, marginTop: 4 },
  empty: { paddingVertical: 24, alignItems: 'center' },
  emptyText: {
    fontSize: 14,
    color: nocturne.inkFaint,
    fontFamily: fonts.sans,
  },

  // Active round glass card
  activeRoundRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  roundNumberBadge: {
    fontSize: 11,
    fontFamily: fonts.sansMedium,
    color: nocturne.inkMuted,
    letterSpacing: 0.8,
  },
  roundPrompt: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: nocturne.ink,
    lineHeight: 24,
  },
  roundTimeLeft: {
    fontSize: 12,
    color: nocturne.inkMuted,
    fontFamily: fonts.sans,
    marginTop: 4,
  },
  roundEditBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: nocturne.cardBorder,
  },
  roundEditBtnText: {
    fontSize: 11,
    color: nocturne.inkMuted,
    fontFamily: fonts.sansMedium,
  },

  // Completed section
  completedDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    marginBottom: 4,
  },
  completedDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: nocturne.cardBorder,
  },
  completedDividerLabel: {
    fontSize: 10,
    fontFamily: fonts.sansSemiBold,
    color: nocturne.inkMuted,
    letterSpacing: 1.6,
  },
  completedList: { gap: 0 },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  completedNumber: {
    fontFamily: fonts.serifItalic,
    fontSize: 16,
    color: nocturne.inkFaint,
    width: 36,
  },
  completedBody: { flex: 1, minWidth: 0 },
  completedPrompt: {
    fontFamily: fonts.serif,
    fontSize: 16,
    color: nocturne.ink,
    lineHeight: 22,
  },
  completedChev: {
    fontSize: 20,
    color: nocturne.inkFaint,
    marginLeft: 8,
  },

  // Add round
  addRoundBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: nocturne.cardBorder,
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
  },
  addRoundBtnIcon: {
    fontSize: 18,
    color: nocturne.blue,
    fontFamily: fonts.sansBold,
    lineHeight: 20,
  },
  addRoundBtnText: {
    fontSize: 14,
    fontFamily: fonts.sansSemiBold,
    color: nocturne.blue,
    letterSpacing: 0.3,
  },
});

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: colors.bgPrimary },
  centered: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' },
  mutedText: { color: colors.textMuted, fontSize: 15 },

  root: { backgroundColor: colors.bgPrimary, padding: 24, paddingBottom: 48, gap: 20 },
  editBtn: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusActive: { backgroundColor: colors.brandFaint },
  statusDone: { backgroundColor: colors.bgStatusDone },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: colors.brand },
  seasonMeta: { fontSize: 13, color: colors.textMuted, marginTop: -12 },

  // Tab bar
  tabBar: { flexDirection: 'row', backgroundColor: colors.surface1, borderRadius: 10, padding: 3, gap: 3 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabBtnActive: { backgroundColor: colors.surface2 },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabBtnTextActive: { color: colors.textPrimary },

  section: { gap: 12 },

  completedRoundsBreak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  completedRoundsBreakLine: { flex: 1, height: 1, backgroundColor: colors.surface4 },
  completedRoundsBreakLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.textLabel,
  },
  completedRoundsSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.textLabel,
    marginBottom: 4,
    marginTop: 2,
  },

  empty: { paddingVertical: 24, alignItems: 'center' },
  emptyText: { fontSize: 14, color: colors.textDim },

  roundCard: { backgroundColor: colors.surface1, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 8 },
  roundHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roundHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roundNumber: { fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  roundStatus: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  roundEditBtn: { backgroundColor: colors.surface2, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.borderInput },
  roundEditBtnText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  roundPrompt: { fontSize: 15, color: colors.textLight, lineHeight: 20, fontWeight: '700' },
  roundDescription: { fontSize: 13, color: colors.textSubtle, lineHeight: 18, marginTop: -2 },
  roundDates: { gap: 2, marginTop: 4 },
  dateLabel: { fontSize: 11, color: colors.textMuted },
  dateValue: { color: colors.textSecondary },

  // Add round CTA
  addRoundBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: 12,
    padding: 16,
    marginTop: 4,
  },
  addRoundBtnIcon: {
    fontSize: 18,
    color: colors.brand,
    fontWeight: '800',
    lineHeight: 20,
  },
  addRoundBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.brand,
    letterSpacing: 0.3,
  },

  forfeitFootnote: {
    fontSize: 11,
    color: colors.textSubtle,
    fontStyle: 'italic',
    marginTop: 2,
  },

  // Submission status on active round cards
  submissionStatus: { gap: 6, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.borderSubtle, marginTop: 2 },
  avatarStackRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarStackLabel: { fontSize: 11, fontWeight: '700', width: 90 },
  avatarStackAvatars: { flexDirection: 'row', alignItems: 'center' },
  avatarStackBubble: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surface4, borderWidth: 1.5, borderColor: colors.surface1, alignItems: 'center', justifyContent: 'center' },
  avatarStackInitial: { fontSize: 10, fontWeight: '700', color: colors.textPrimary },
  avatarStackOverflow: { backgroundColor: colors.surface3 },
  avatarStackOverflowText: { fontSize: 9, fontWeight: '700', color: colors.textSecondary },

  standingsHint: {
    fontSize: 12,
    color: colors.textLabel,
    lineHeight: 17,
    marginBottom: 4,
  },
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#151515', // very dark divider, no token needed
  },
  standingRank: {
    width: 26,
    fontSize: 14,
    fontWeight: '800',
    color: colors.textLabel,
    textAlign: 'center',
  },
  standingMeta: { flex: 1, minWidth: 0 },
  standingName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  standingSub: { fontSize: 11, color: colors.textMuted, marginTop: 3 },
  standingBadges: { flexDirection: 'row', gap: 6, alignItems: 'center', flexShrink: 0 },
  standingPts: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.brand,
    minWidth: 44,
    textAlign: 'right',
  },

  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  memberName: { flex: 1, fontSize: 15, color: colors.textPrimary, fontWeight: '500' },
  memberBadges: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  commBadge: { fontSize: 9, fontWeight: '800', color: colors.brand, letterSpacing: 1 },
  roleBadge: { fontSize: 9, fontWeight: '700', color: colors.textMuted, letterSpacing: 1 },
  roleBadgeSpectator: { color: colors.textDim },
  spectatorSection: { marginTop: 16, gap: 8 },
  spectatorSectionTitle: { fontSize: 11, fontWeight: '700', color: colors.textDim, letterSpacing: 1, textTransform: 'uppercase' },
  spectatorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4, opacity: 0.6 },
  spectatorName: { flex: 1, fontSize: 14, color: colors.textSecondary, fontWeight: '500' },

  // Stepper
  stepper: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  stepBtn: { width: 44, height: 44, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.borderInput, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  stepBtnTxt: { fontSize: 22, color: colors.textPrimary, fontWeight: '300' },
  stepVal: { minWidth: 52, textAlign: 'center', fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  stepperUnit: { fontSize: 14, color: colors.textMuted },

  // Date picker
  dateField: { backgroundColor: colors.surface1, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: colors.borderInput, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  dateFieldText: { fontSize: 15, color: colors.textPrimary },
  dateFieldIcon: { fontSize: 16 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: colors.surface2, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 32 },
  pickerToolbar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.borderInput },
  pickerCancel: { fontSize: 15, color: colors.textSecondary },
  pickerDone: { fontSize: 15, color: colors.brand, fontWeight: '700' },

  // Edit modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.bgCardDark, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  modalTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  modalCancel: { fontSize: 15, color: colors.textSecondary },
  modalSave: { fontSize: 15, color: colors.brand, fontWeight: '700' },
  modalBody: { padding: 20, paddingBottom: 48, gap: 4 },
  modalInput: { backgroundColor: colors.surface1, borderRadius: 10, padding: 14, fontSize: 15, color: colors.textPrimary, borderWidth: 1, borderColor: colors.borderInput, marginTop: 8 },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' },
  fieldHint: { fontSize: 11, color: colors.textDim, marginTop: 2 },
});
