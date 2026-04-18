import { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl, ScrollView, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Alert,
} from 'react-native';
import { KeyboardScroll } from '@/components/KeyboardScroll'; // used inside modals only
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
  if (!prevCompleted) return { label: 'UPCOMING', color: '#444', isActive: false, stage: 'upcoming' };

  const round = rounds[index];
  const subDeadline = new Date(round.submission_deadline_at).getTime();
  const voteDeadline = new Date(round.voting_deadline_at).getTime();
  if (now < subDeadline) return { label: 'SUBMISSIONS OPEN', color: '#1DB954', isActive: true, stage: 'submissions' };
  if (now < voteDeadline) return { label: 'VOTING OPEN', color: '#f0a500', isActive: true, stage: 'voting' };
  return { label: 'COMPLETED', color: '#555', isActive: false, stage: 'completed' };
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
              placeholderTextColor="#555"
              autoFocus
            />

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>DESCRIPTION</Text>
            <TextInput
              style={[styles.modalInput, { minHeight: 72, textAlignVertical: 'top' }]}
              value={form.description}
              onChangeText={(description) => setForm((f) => ({ ...f, description }))}
              multiline
              placeholder="Extra context or rules for the round"
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

type Tab = 'rounds' | 'standings';

export function SeasonScreen({ seasonId, leagueId }: { seasonId: string; leagueId?: string }) {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [submittersByRound, setSubmittersByRound] = useState<Record<string, string[]>>({});
  const [votersByRound, setVotersByRound] = useState<Record<string, string[]>>({});
  const [forfeitsByRound, setForfeitsByRound] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('rounds');

  const [editingSeasonOpen, setEditingSeasonOpen] = useState(false);
  const [editingRound, setEditingRound] = useState<Round | null>(null);
  const [creatingRound, setCreatingRound] = useState(false);

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

    const [{ data: roundsData }, { data: membersData }, standingsRes] = await Promise.all([
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.rpc as any)('get_season_standings', { p_season_id: seasonId }),
    ]);

    const roundIds = (roundsData ?? []).map((r) => r.id);
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

    // Build map: roundId → unique user_ids who submitted
    const byRound: Record<string, string[]> = {};
    for (const sub of (subsData ?? [])) {
      if (!byRound[sub.round_id]) byRound[sub.round_id] = [];
      if (!byRound[sub.round_id].includes(sub.user_id)) byRound[sub.round_id].push(sub.user_id);
    }

    // Build map: roundId → unique voter_user_ids
    const votersBy: Record<string, string[]> = {};
    for (const v of (votesData ?? [])) {
      if (!votersBy[v.round_id]) votersBy[v.round_id] = [];
      if (!votersBy[v.round_id].includes(v.voter_user_id)) votersBy[v.round_id].push(v.voter_user_id);
    }

    // Build map: roundId → forfeit count (participants flagged is_void)
    const forfeitsBy: Record<string, number> = {};
    for (const p of (participantsData ?? [])) {
      if (p.is_void) forfeitsBy[p.round_id] = (forfeitsBy[p.round_id] ?? 0) + 1;
    }

    setSeason({ ...seasonData, leagues: league ?? null });
    setRounds(roundsData ?? []);
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
  }, [seasonId]);

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

  const renderRoundCard = (round: Round) => {
    const st = statusByRoundId[round.id];
    const { label, color, isActive, stage } = st ?? {
      label: '—',
      color: '#555',
      isActive: false,
      stage: 'completed' as RoundStage,
    };
    const activeIds = stage === 'voting'
      ? (votersByRound[round.id] ?? [])
      : (submittersByRound[round.id] ?? []);
    const doneMembers = members.filter((m) => activeIds.includes(m.user_id));
    const waitingMembers = members.filter((m) => !activeIds.includes(m.user_id));
    const doneLabel = stage === 'voting' ? 'Voted' : 'Submitted';
    const forfeitCount = forfeitsByRound[round.id] ?? 0;

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
            <AvatarStack members={doneMembers} label={doneLabel} color={stage === 'voting' ? '#f0a500' : '#1DB954'} />
            {waitingMembers.length > 0 && (
              <AvatarStack members={waitingMembers} label="Waiting" color="#555" />
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

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.root}
        style={{ backgroundColor: '#000' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1DB954" />}
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
            style={[styles.tabBtn, tab === 'standings' && styles.tabBtnActive]}
            onPress={() => setTab('standings')}
          >
            <Text style={[styles.tabBtnText, tab === 'standings' && styles.tabBtnTextActive]}>
              Standings
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
              <>
                {/* In-progress & upcoming: highest round number first (current action at top) */}
                {incompleteRounds.map((round) => renderRoundCard(round))}

                {completedRounds.length > 0 && incompleteRounds.length > 0 && (
                  <View style={styles.completedRoundsBreak}>
                    <View style={styles.completedRoundsBreakLine} />
                    <Text style={styles.completedRoundsBreakLabel}>Completed rounds</Text>
                    <View style={styles.completedRoundsBreakLine} />
                  </View>
                )}

                {completedRounds.length > 0 && incompleteRounds.length === 0 && (
                  <Text style={styles.completedRoundsSectionTitle}>Completed rounds</Text>
                )}

                {/* Finished rounds: highest round number first (most recent completion at top) */}
                {completedRounds.map((round) => renderRoundCard(round))}
              </>
            )}

            {isCommissioner && season.status === 'active' && (
              <TouchableOpacity
                style={styles.addRoundBtn}
                onPress={() => setCreatingRound(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.addRoundBtnIcon}>+</Text>
                <Text style={styles.addRoundBtnText}>Add Round</Text>
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
            {standingsWithRank.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No standings yet.</Text>
              </View>
            ) : (
              standingsWithRank.map((row) => (
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
                  <View style={styles.standingBadges}>
                    {row.user_id === league?.admin_user_id && (
                      <Text style={styles.commBadge}>COMM</Text>
                    )}
                    <Text style={[styles.roleBadge, row.member_role === 'spectator' && styles.roleBadgeSpectator]}>
                      {row.member_role.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.standingPts}>{row.total_points}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

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
        <RoundFormModal
          mode={{ kind: 'edit', round: editingRound }}
          visible={editingRound !== null}
          onClose={() => setEditingRound(null)}
          onSaved={fetchData}
        />
      )}

      {/* ── Round create modal ── */}
      {isCommissioner && creatingRound && (
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

  completedRoundsBreak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  completedRoundsBreakLine: { flex: 1, height: 1, backgroundColor: '#2a2a2a' },
  completedRoundsBreakLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#666',
  },
  completedRoundsSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#666',
    marginBottom: 4,
    marginTop: 2,
  },

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

  // Add round CTA
  addRoundBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#333',
    borderRadius: 12,
    padding: 16,
    marginTop: 4,
  },
  addRoundBtnIcon: {
    fontSize: 18,
    color: '#1DB954',
    fontWeight: '800',
    lineHeight: 20,
  },
  addRoundBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1DB954',
    letterSpacing: 0.3,
  },

  forfeitFootnote: {
    fontSize: 11,
    color: '#777',
    fontStyle: 'italic',
    marginTop: 2,
  },

  // Submission status on active round cards
  submissionStatus: { gap: 6, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#1a1a1a', marginTop: 2 },
  avatarStackRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarStackLabel: { fontSize: 11, fontWeight: '700', width: 90 },
  avatarStackAvatars: { flexDirection: 'row', alignItems: 'center' },
  avatarStackBubble: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#2a2a2a', borderWidth: 1.5, borderColor: '#111', alignItems: 'center', justifyContent: 'center' },
  avatarStackInitial: { fontSize: 10, fontWeight: '700', color: '#fff' },
  avatarStackOverflow: { backgroundColor: '#222' },
  avatarStackOverflowText: { fontSize: 9, fontWeight: '700', color: '#888' },

  standingsHint: {
    fontSize: 12,
    color: '#666',
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
    borderBottomColor: '#151515',
  },
  standingRank: {
    width: 26,
    fontSize: 14,
    fontWeight: '800',
    color: '#666',
    textAlign: 'center',
  },
  standingMeta: { flex: 1, minWidth: 0 },
  standingName: { fontSize: 15, fontWeight: '600', color: '#fff' },
  standingSub: { fontSize: 11, color: '#555', marginTop: 3 },
  standingBadges: { flexDirection: 'row', gap: 6, alignItems: 'center', flexShrink: 0 },
  standingPts: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1DB954',
    minWidth: 44,
    textAlign: 'right',
  },

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
