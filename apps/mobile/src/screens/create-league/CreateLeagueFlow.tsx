import { useState } from 'react';
import {
  ScrollView, View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Switch, Modal, Platform,
} from 'react-native';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type PlaylistMode = 'fresh' | 'cloned' | 'linked';

type LeagueForm = {
  name: string;
  playlistMode: PlaylistMode;
  playlistRef: string;
};

type SeasonForm = {
  name: string;
  hasParticipantCap: boolean;
  participantCap: string;
  pointsPerRound: number;
  maxPointsPerTrack: number;
  startDate: Date;
  submissionDays: number;
  votingDays: number;
};

type RoundForm = {
  key: string;
  prompt: string;
  submissionDeadline: Date;
  votingDeadline: Date;
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function makeRound(season: SeasonForm, prevVoteDeadline?: Date): RoundForm {
  const base = prevVoteDeadline ? new Date(prevVoteDeadline) : new Date(season.startDate);
  const subDeadline = addDays(base, season.submissionDays);
  const voteDeadline = addDays(subDeadline, season.votingDays);
  return {
    key: String(Date.now() + Math.random()),
    prompt: '',
    submissionDeadline: subDeadline,
    votingDeadline: voteDeadline,
  };
}

// ─── Shared components ────────────────────────────────────────────────────────

function StepHeader({ step, total, title, subtitle }: { step: number; total: number; title: string; subtitle?: string }) {
  return (
    <View style={sh.wrap}>
      <View style={sh.dots}>
        {Array.from({ length: total }).map((_, i) => (
          <View key={i} style={[sh.dot, i < step && sh.dotDone, i === step - 1 && sh.dotActive]} />
        ))}
      </View>
      <Text style={sh.title}>{title}</Text>
      {subtitle && <Text style={sh.subtitle}>{subtitle}</Text>}
    </View>
  );
}
const sh = StyleSheet.create({
  wrap: { gap: 10, marginBottom: 4 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#333' },
  dotActive: { backgroundColor: '#1DB954', width: 24 },
  dotDone: { backgroundColor: '#1DB954' },
  title: { fontSize: 26, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 13, color: '#555', lineHeight: 18 },
});

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={fld.wrap}>
      <Text style={fld.label}>{label}</Text>
      {hint && <Text style={fld.hint}>{hint}</Text>}
      {children}
    </View>
  );
}
const fld = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 12, fontWeight: '700', color: '#666', letterSpacing: 0.8, textTransform: 'uppercase' },
  hint: { fontSize: 11, color: '#444', marginTop: -2 },
});

function Stepper({ value, onChange, min = 1, max = 100 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
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

// ─── Native date/time picker ──────────────────────────────────────────────────

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

// ─── Step 1: League ───────────────────────────────────────────────────────────

function Step1League({ form, onChange }: { form: LeagueForm; onChange: (f: LeagueForm) => void }) {
  const MODES: { value: PlaylistMode; label: string; desc: string }[] = [
    { value: 'fresh', label: 'Fresh', desc: 'Start a new playlist each season' },
    { value: 'cloned', label: 'Cloned', desc: 'Clone tracks from an existing Spotify playlist' },
    { value: 'linked', label: 'Linked', desc: 'Sync with an existing Spotify playlist live' },
  ];

  return (
    <View style={styles.stepWrap}>
      <StepHeader step={1} total={3} title="League Setup" subtitle="Your permanent league. These settings apply across all seasons." />

      <Field label="League Name">
        <TextInput
          style={styles.input}
          placeholder="e.g. The Crate Diggers"
          placeholderTextColor="#555"
          value={form.name}
          onChangeText={(name) => onChange({ ...form, name })}
          autoFocus
        />
      </Field>

      <Field label="Master Playlist" hint="How is the all-time league playlist managed?">
        <View style={styles.modeList}>
          {MODES.map(({ value, label, desc }) => (
            <TouchableOpacity
              key={value}
              style={[styles.modeCard, form.playlistMode === value && styles.modeCardActive]}
              onPress={() => onChange({ ...form, playlistMode: value })}
            >
              <Text style={[styles.modeLabel, form.playlistMode === value && styles.modeLabelActive]}>{label}</Text>
              <Text style={styles.modeDesc}>{desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Field>

      {form.playlistMode !== 'fresh' && (
        <Field label="Spotify Playlist URL">
          <TextInput
            style={styles.input}
            placeholder="https://open.spotify.com/playlist/..."
            placeholderTextColor="#555"
            value={form.playlistRef}
            onChangeText={(playlistRef) => onChange({ ...form, playlistRef })}
            autoCapitalize="none"
            keyboardType="url"
          />
        </Field>
      )}
    </View>
  );
}

// ─── Step 2: Season ───────────────────────────────────────────────────────────

function Step2Season({ form, onChange }: { form: SeasonForm; onChange: (f: SeasonForm) => void }) {
  return (
    <View style={styles.stepWrap}>
      <StepHeader step={2} total={3} title="Season Rules" subtitle="Sets the defaults and cadence for all rounds in this season." />

      <Field label="Season Name">
        <TextInput
          style={styles.input}
          placeholder="e.g. Spring 2026"
          placeholderTextColor="#555"
          value={form.name}
          onChangeText={(name) => onChange({ ...form, name })}
          autoFocus
        />
      </Field>

      <View style={styles.divider} />
      <Text style={styles.groupLabel}>ROUND CADENCE</Text>

      <Field label="Season Start" hint="When does the first submission window open?">
        <DateTimeField value={form.startDate} onChange={(startDate) => onChange({ ...form, startDate })} />
      </Field>

      <Field label="Submission Period" hint="How many days is each submission window open?">
        <View style={styles.stepperRow}>
          <Stepper value={form.submissionDays} onChange={(v) => onChange({ ...form, submissionDays: v })} min={1} max={30} />
          <Text style={styles.stepperUnit}>{form.submissionDays === 1 ? 'day' : 'days'}</Text>
        </View>
      </Field>

      <Field label="Voting Period" hint="How many days after submissions close for voting?">
        <View style={styles.stepperRow}>
          <Stepper value={form.votingDays} onChange={(v) => onChange({ ...form, votingDays: v })} min={1} max={30} />
          <Text style={styles.stepperUnit}>{form.votingDays === 1 ? 'day' : 'days'}</Text>
        </View>
      </Field>

      <View style={styles.cadenceSummary}>
        <Text style={styles.cadenceSummaryText}>
          Each round cycle: <Text style={styles.cadenceHighlight}>{form.submissionDays + form.votingDays} days</Text>
        </Text>
      </View>

      <View style={styles.divider} />
      <Text style={styles.groupLabel}>SCORING</Text>

      <Field label="Points Per Round" hint="Total points each player distributes per round">
        <View style={styles.stepperRow}>
          <Stepper value={form.pointsPerRound} onChange={(v) => onChange({ ...form, pointsPerRound: v })} min={1} max={100} />
          <Text style={styles.stepperUnit}>pts</Text>
        </View>
      </Field>

      <Field label="Max Per Track" hint="Maximum a single track can receive from one voter">
        <View style={styles.stepperRow}>
          <Stepper
            value={form.maxPointsPerTrack}
            onChange={(v) => onChange({ ...form, maxPointsPerTrack: Math.min(v, form.pointsPerRound) })}
            min={1}
            max={form.pointsPerRound}
          />
          <Text style={styles.stepperUnit}>pts</Text>
        </View>
      </Field>

      <View style={styles.divider} />
      <Text style={styles.groupLabel}>PARTICIPANTS</Text>

      <Field label="Participant Cap">
        <View style={styles.capRow}>
          <Text style={styles.capLabel}>No limit</Text>
          <Switch
            value={form.hasParticipantCap}
            onValueChange={(v) => onChange({ ...form, hasParticipantCap: v, participantCap: v ? '10' : '' })}
            trackColor={{ true: '#1DB954', false: '#333' }}
            thumbColor="#fff"
          />
          {form.hasParticipantCap && (
            <TextInput
              style={[styles.input, styles.inputSmall]}
              value={form.participantCap}
              onChangeText={(participantCap) => onChange({ ...form, participantCap })}
              keyboardType="number-pad"
              placeholder="10"
              placeholderTextColor="#555"
            />
          )}
        </View>
      </Field>
    </View>
  );
}

// ─── Step 3: Rounds ───────────────────────────────────────────────────────────

function Step3Rounds({
  rounds, season, onUpdate, onAdd, onRemove,
}: {
  rounds: RoundForm[];
  season: SeasonForm;
  onUpdate: (key: string, patch: Partial<RoundForm>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
}) {
  return (
    <View style={styles.stepWrap}>
      <StepHeader
        step={3}
        total={3}
        title="Rounds"
        subtitle={`Deadlines auto-set from cadence (${season.submissionDays}d subs + ${season.votingDays}d voting). Tap to adjust individually.`}
      />

      {rounds.map((round, index) => (
        <View key={round.key} style={styles.roundBlock}>
          <View style={styles.roundBlockHeader}>
            <Text style={styles.roundBlockTitle}>Round {index + 1}</Text>
            {rounds.length > 1 && (
              <TouchableOpacity onPress={() => onRemove(round.key)}>
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>

          <Field label="Prompt" hint="The musical theme or challenge for this round">
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="e.g. A song that changed your life"
              placeholderTextColor="#555"
              value={round.prompt}
              onChangeText={(prompt) => onUpdate(round.key, { prompt })}
              multiline
            />
          </Field>

          <Field label="Submission Deadline">
            <DateTimeField
              value={round.submissionDeadline}
              onChange={(d) => onUpdate(round.key, { submissionDeadline: d })}
            />
          </Field>

          <Field label="Voting Deadline">
            <DateTimeField
              value={round.votingDeadline}
              onChange={(d) => onUpdate(round.key, { votingDeadline: d })}
            />
          </Field>
        </View>
      ))}

      <TouchableOpacity style={styles.addRoundBtn} onPress={onAdd}>
        <Text style={styles.addRoundBtnText}>+ Add Round</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const defaultStart = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  return d;
})();

export function CreateLeagueFlow() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const [league, setLeague] = useState<LeagueForm>({ name: '', playlistMode: 'fresh', playlistRef: '' });

  const [season, setSeason] = useState<SeasonForm>({
    name: '',
    hasParticipantCap: false,
    participantCap: '',
    pointsPerRound: 10,
    maxPointsPerTrack: 5,
    startDate: defaultStart,
    submissionDays: 5,
    votingDays: 3,
  });

  const [rounds, setRounds] = useState<RoundForm[]>(() => {
    const s: SeasonForm = {
      name: '', hasParticipantCap: false, participantCap: '',
      pointsPerRound: 10, maxPointsPerTrack: 5,
      startDate: defaultStart, submissionDays: 5, votingDays: 3,
    };
    return [makeRound(s)];
  });

  // When season cadence changes (on step 2), regenerate rounds if user hasn't touched them yet
  const handleSeasonChange = (updated: SeasonForm) => {
    setSeason(updated);
    // Regenerate all rounds from new cadence
    setRounds((prev) =>
      prev.map((r, i) => {
        const base = i === 0 ? new Date(updated.startDate) : addDays(updated.startDate, i * (updated.submissionDays + updated.votingDays));
        return {
          ...r,
          submissionDeadline: addDays(base, updated.submissionDays),
          votingDeadline: addDays(base, updated.submissionDays + updated.votingDays),
        };
      }),
    );
  };

  const updateRound = (key: string, patch: Partial<RoundForm>) => {
    setRounds((prev) => prev.map((r) => r.key === key ? { ...r, ...patch } : r));
  };

  const addRound = () => {
    setRounds((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, makeRound(season, last.votingDeadline)];
    });
  };

  const removeRound = (key: string) => setRounds((prev) => prev.filter((r) => r.key !== key));

  const canAdvance = () => {
    if (step === 1) return league.name.trim().length > 0;
    if (step === 2) return season.name.trim().length > 0;
    return rounds.every((r) => r.prompt.trim().length > 0);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data: leagueId, error: leagueErr } = await supabase.rpc('create_league', { league_name: league.name });
      if (leagueErr) throw new Error(leagueErr.message);
      if (!leagueId) throw new Error('No league ID returned');

      if (league.playlistMode !== 'fresh') {
        await supabase.from('leagues').update({
          master_playlist_mode: league.playlistMode,
          master_playlist_ref: league.playlistRef || null,
        }).eq('id', leagueId as string);
      }

      const { data: seasonData, error: seasonErr } = await supabase
        .from('seasons')
        .insert({
          league_id: leagueId as string,
          name: season.name,
          season_number: 1,
          participant_cap: season.hasParticipantCap ? parseInt(season.participantCap) || null : null,
          default_points_per_round: season.pointsPerRound,
          default_max_points_per_track: season.maxPointsPerTrack,
        })
        .select('id')
        .single();
      if (seasonErr) throw new Error(seasonErr.message);

      const { error: roundsErr } = await supabase.from('rounds').insert(
        rounds.map((r, i) => ({
          season_id: seasonData!.id,
          round_number: i + 1,
          prompt: r.prompt,
          submission_deadline_at: r.submissionDeadline.toISOString(),
          voting_deadline_at: r.votingDeadline.toISOString(),
        })),
      );
      if (roundsErr) throw new Error(roundsErr.message);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace({ pathname: '/league/[id]' as any, params: { id: leagueId as string } });
    } catch (err) {
      console.error('Create flow error:', err);
      Alert.alert('Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => step > 1 ? setStep((s) => s - 1) : router.back()}>
          <Text style={styles.backText}>{step > 1 ? '← Back' : '✕ Cancel'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {step === 1 && <Step1League form={league} onChange={setLeague} />}
        {step === 2 && <Step2Season form={season} onChange={handleSeasonChange} />}
        {step === 3 && (
          <Step3Rounds
            rounds={rounds}
            season={season}
            onUpdate={updateRound}
            onAdd={addRound}
            onRemove={removeRound}
          />
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step < 3 ? (
          <TouchableOpacity
            style={[styles.nextBtn, !canAdvance() && styles.btnDisabled]}
            onPress={() => setStep((s) => s + 1)}
            disabled={!canAdvance()}
          >
            <Text style={styles.nextBtnText}>Next →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.nextBtn, (!canAdvance() || submitting) && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={!canAdvance() || submitting}
          >
            {submitting
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.nextBtnText}>Create League & Season</Text>}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 8 },
  backText: { color: '#1DB954', fontSize: 15, fontWeight: '600' },
  scroll: { padding: 24, paddingBottom: 48 },
  stepWrap: { gap: 24 },

  input: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  inputSmall: { width: 72, paddingVertical: 10, textAlign: 'center' },

  modeList: { gap: 8 },
  modeCard: { backgroundColor: '#111', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#2a2a2a', gap: 2 },
  modeCardActive: { borderColor: '#1DB954', backgroundColor: '#0a1f10' },
  modeLabel: { fontSize: 14, fontWeight: '700', color: '#666' },
  modeLabelActive: { color: '#1DB954' },
  modeDesc: { fontSize: 12, color: '#444' },

  divider: { height: 1, backgroundColor: '#1a1a1a' },
  groupLabel: { fontSize: 11, fontWeight: '800', color: '#444', letterSpacing: 1.5 },

  stepper: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  stepBtn: { width: 44, height: 44, backgroundColor: '#111', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  stepBtnTxt: { fontSize: 22, color: '#fff', fontWeight: '300' },
  stepVal: { minWidth: 52, textAlign: 'center', fontSize: 20, fontWeight: '700', color: '#fff' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepperUnit: { fontSize: 14, color: '#555' },

  cadenceSummary: { backgroundColor: '#111', borderRadius: 8, padding: 12 },
  cadenceSummaryText: { fontSize: 13, color: '#555' },
  cadenceHighlight: { color: '#1DB954', fontWeight: '700' },

  capRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  capLabel: { fontSize: 14, color: '#555' },

  // Date picker field
  dateField: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateFieldText: { fontSize: 15, color: '#fff' },
  dateFieldIcon: { fontSize: 16 },

  // Picker modal
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 32 },
  pickerToolbar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  pickerCancel: { fontSize: 15, color: '#888' },
  pickerDone: { fontSize: 15, color: '#1DB954', fontWeight: '700' },

  // Rounds
  roundBlock: { backgroundColor: '#0d0d0d', borderRadius: 12, padding: 16, gap: 16, borderWidth: 1, borderColor: '#1a1a1a' },
  roundBlockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roundBlockTitle: { fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  removeText: { fontSize: 13, color: '#c0392b' },

  addRoundBtn: { padding: 16, borderRadius: 10, borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center' },
  addRoundBtnText: { fontSize: 14, color: '#555', fontWeight: '600' },

  footer: { padding: 24, paddingBottom: 36, borderTopWidth: 1, borderTopColor: '#111' },
  nextBtn: { backgroundColor: '#1DB954', padding: 16, borderRadius: 12, alignItems: 'center' },
  btnDisabled: { opacity: 0.35 },
  nextBtnText: { fontSize: 16, fontWeight: '800', color: '#000' },
});
