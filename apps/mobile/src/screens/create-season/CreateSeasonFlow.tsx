import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Switch, Modal, Platform,
} from 'react-native';
import { KeyboardScroll } from '@/components/KeyboardScroll';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { Stack, useRouter } from 'expo-router';
import { useLeague } from '@/context/LeagueContext';
import { useCreateSeason } from '@/queries/useCreateSeason';
import { hasInProgressSeason } from '@/services/seasons';
import { MixError } from '@/services/errors';

// ─── Types ────────────────────────────────────────────────────────────────────

type SeasonForm = {
  name: string;
  hasParticipantCap: boolean;
  participantCap: string;
  submissionsPerUser: number;
  pointsPerRound: number;
  maxPointsPerTrack: number;
  startDate: Date;
  submissionDays: number;
  votingDays: number;
};

type RoundForm = {
  key: string;
  prompt: string;
  description: string;
  submissionDeadline: Date;
  votingDeadline: Date;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  return {
    key: String(Date.now() + Math.random()),
    prompt: '',
    description: '',
    submissionDeadline: addDays(base, season.submissionDays),
    votingDeadline: addDays(base, season.submissionDays + season.votingDays),
  };
}

// ─── Shared components ────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
      {children}
    </View>
  );
}

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

// ─── Step 1: Season settings ──────────────────────────────────────────────────

function StepSeason({ form, onChange }: { form: SeasonForm; onChange: (f: SeasonForm) => void }) {
  return (
    <View style={styles.stepWrap}>
      <Text style={styles.stepTitle}>Season Settings</Text>
      <Text style={styles.stepSubtitle}>Cadence and scoring defaults for all rounds.</Text>

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

      <Field label="Submission Period">
        <View style={styles.stepperRow}>
          <Stepper value={form.submissionDays} onChange={(v) => onChange({ ...form, submissionDays: v })} min={1} max={30} />
          <Text style={styles.stepperUnit}>{form.submissionDays === 1 ? 'day' : 'days'}</Text>
        </View>
      </Field>

      <Field label="Voting Period">
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

      <Field label="Submissions Per Round" hint="How many tracks each player submits per round">
        <View style={styles.stepperRow}>
          <Stepper value={form.submissionsPerUser} onChange={(v) => onChange({ ...form, submissionsPerUser: v })} min={1} max={10} />
          <Text style={styles.stepperUnit}>{form.submissionsPerUser === 1 ? 'track' : 'tracks'}</Text>
        </View>
      </Field>

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

// ─── Step 2: Rounds ───────────────────────────────────────────────────────────

function StepRounds({
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
      <Text style={styles.stepTitle}>Rounds</Text>
      <Text style={styles.stepSubtitle}>
        Deadlines auto-set from cadence ({season.submissionDays}d subs + {season.votingDays}d voting). Tap to adjust.
      </Text>

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

          <Field label="Prompt" hint="The theme or challenge for this round">
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="e.g. A song that changed your life"
              placeholderTextColor="#555"
              value={round.prompt}
              onChangeText={(prompt) => onUpdate(round.key, { prompt })}
              multiline
            />
          </Field>

          <Field label="Description" hint="Extra context players should keep in mind for the prompt">
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="e.g. Tell us why this track earns its spot."
              placeholderTextColor="#555"
              value={round.description}
              onChangeText={(description) => onUpdate(round.key, { description })}
              multiline
            />
          </Field>

          <Field label="Submission Deadline">
            <DateTimeField value={round.submissionDeadline} onChange={(d) => onUpdate(round.key, { submissionDeadline: d })} />
          </Field>

          <Field label="Voting Deadline">
            <DateTimeField value={round.votingDeadline} onChange={(d) => onUpdate(round.key, { votingDeadline: d })} />
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

const defaultSeason: SeasonForm = {
  name: '',
  hasParticipantCap: false,
  participantCap: '',
  submissionsPerUser: 2,
  pointsPerRound: 10,
  maxPointsPerTrack: 5,
  startDate: defaultStart,
  submissionDays: 5,
  votingDays: 3,
};

export function CreateSeasonFlow() {
  const router = useRouter();
  const { activeLeagueId } = useLeague();
  const [step, setStep] = useState<1 | 2>(1);
  const createSeasonMutation = useCreateSeason();
  const submitting = createSeasonMutation.isPending;

  const [season, setSeason] = useState<SeasonForm>(defaultSeason);
  const [rounds, setRounds] = useState<RoundForm[]>([makeRound(defaultSeason)]);

  const handleSeasonChange = (updated: SeasonForm) => {
    setSeason(updated);
    setRounds((prev) =>
      prev.map((r, i) => {
        const base = i === 0
          ? new Date(updated.startDate)
          : addDays(updated.startDate, i * (updated.submissionDays + updated.votingDays));
        return {
          ...r,
          submissionDeadline: addDays(base, updated.submissionDays),
          votingDeadline: addDays(base, updated.submissionDays + updated.votingDays),
        };
      }),
    );
  };

  const updateRound = (key: string, patch: Partial<RoundForm>) =>
    setRounds((prev) => prev.map((r) => r.key === key ? { ...r, ...patch } : r));

  const addRound = () =>
    setRounds((prev) => [...prev, makeRound(season, prev[prev.length - 1].votingDeadline)]);

  const removeRound = (key: string) =>
    setRounds((prev) => prev.filter((r) => r.key !== key));

  const canAdvanceStep1 = season.name.trim().length > 0;
  const canSubmit = rounds.every(
    (r) => r.prompt.trim().length > 0 && r.description.trim().length > 0,
  );

  const handleSubmit = async () => {
    if (!activeLeagueId) return;
    try {
      if (await hasInProgressSeason(activeLeagueId)) {
        Alert.alert('Season in progress', 'A season is already running in this league. Wait for it to finish before creating a new one.');
        return;
      }

      await createSeasonMutation.mutateAsync({
        leagueId: activeLeagueId,
        name: season.name,
        participantCap: season.hasParticipantCap
          ? parseInt(season.participantCap) || null
          : null,
        submissionsPerUser: season.submissionsPerUser,
        defaultPointsPerRound: season.pointsPerRound,
        defaultMaxPointsPerTrack: season.maxPointsPerTrack,
        rounds: rounds.map((r) => ({
          prompt: r.prompt,
          description: r.description.trim(),
          submissionDeadlineAt: r.submissionDeadline,
          votingDeadlineAt: r.votingDeadline,
        })),
      });

      router.back();
    } catch (err) {
      Alert.alert('Failed', err instanceof MixError ? err.message : 'Unknown error');
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: step === 1 ? 'New Season' : 'Round Setup',
          headerLeft: step === 2
            ? () => (
                <TouchableOpacity onPress={() => setStep(1)}>
                  <Text style={styles.headerActionText}>‹</Text>
                </TouchableOpacity>
              )
            : undefined,
        }}
      />
      <View style={styles.root}>
        <View style={styles.headerSpacer}>
          <View style={styles.stepDots}>
            {([1, 2] as const).map((s) => (
              <View key={s} style={[styles.dot, s === step && styles.dotActive, s < step && styles.dotDone]} />
            ))}
          </View>
        </View>

        <KeyboardScroll contentContainerStyle={styles.scroll}>
          {step === 1 && <StepSeason form={season} onChange={handleSeasonChange} />}
          {step === 2 && (
            <StepRounds
              rounds={rounds}
              season={season}
              onUpdate={updateRound}
              onAdd={addRound}
              onRemove={removeRound}
            />
          )}
        </KeyboardScroll>

        <View style={styles.footer}>
          {step === 1 ? (
            <TouchableOpacity
              style={[styles.nextBtn, !canAdvanceStep1 && styles.btnDisabled]}
              onPress={() => setStep(2)}
              disabled={!canAdvanceStep1}
            >
              <Text style={styles.nextBtnText}>Next →</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.nextBtn, (!canSubmit || submitting) && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit || submitting}
            >
              {submitting
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.nextBtnText}>Create Season</Text>}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  headerSpacer: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8, alignItems: 'flex-end' },
  headerActionText: { color: '#fff', fontSize: 30, lineHeight: 30, marginLeft: 2 },
  stepDots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#333' },
  dotActive: { backgroundColor: '#1DB954', width: 24 },
  dotDone: { backgroundColor: '#1DB954' },

  scroll: { padding: 24, paddingBottom: 48 },
  stepWrap: { gap: 24 },
  stepTitle: { fontSize: 26, fontWeight: '800', color: '#fff' },
  stepSubtitle: { fontSize: 13, color: '#555', marginTop: -16, lineHeight: 18 },

  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#666', letterSpacing: 0.8, textTransform: 'uppercase' },
  fieldHint: { fontSize: 11, color: '#444', marginTop: -2 },

  input: { backgroundColor: '#111', borderRadius: 10, padding: 14, fontSize: 15, color: '#fff', borderWidth: 1, borderColor: '#2a2a2a' },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  inputSmall: { width: 72, paddingVertical: 10, textAlign: 'center' },

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

  dateField: { backgroundColor: '#111', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#2a2a2a', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateFieldText: { fontSize: 15, color: '#fff' },
  dateFieldIcon: { fontSize: 16 },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 32 },
  pickerToolbar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  pickerCancel: { fontSize: 15, color: '#888' },
  pickerDone: { fontSize: 15, color: '#1DB954', fontWeight: '700' },

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
