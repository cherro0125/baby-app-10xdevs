import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { FeedingDetailsFields } from '@/components/feeding-details-fields';
import { buildEditTimes, parseAmountMl, type FeedingEdit } from '@/components/feeding-edit';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { LocalFeeding, MilkType } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';

type CompletedFeeding = LocalFeeding & { endedAt: string };

interface FeedingEditSheetProps {
  feeding: LocalFeeding | null;
  onClose: () => void;
  onSave: (id: string, changes: FeedingEdit) => Promise<void>;
}

export function FeedingEditSheet({ feeding, onClose, onSave }: FeedingEditSheetProps) {
  // Only completed feedings are listed, so a feeding without an end is never edited here.
  const completed = feeding?.endedAt ? (feeding as CompletedFeeding) : null;
  return (
    <Modal visible={completed !== null} transparent animationType="slide" onRequestClose={onClose}>
      {completed && (
        <FeedingEditSheetInner
          key={completed.id}
          feeding={completed}
          onClose={onClose}
          onSave={onSave}
        />
      )}
    </Modal>
  );
}

const ERROR_KEYS = {
  endBeforeStart: 'timeEdit.endAfterStart',
  tooLong: 'feeding.edit.tooLong',
  invalidAmount: 'feeding.edit.invalidAmount',
  saveFailed: 'feeding.edit.saveFailed',
} as const;

type EditError = keyof typeof ERROR_KEYS;

interface InnerProps {
  feeding: CompletedFeeding;
  onClose: () => void;
  onSave: (id: string, changes: FeedingEdit) => Promise<void>;
}

function FeedingEditSheetInner({ feeding, onClose, onSave }: InnerProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  // Lazy initialisers: constructing from a known ISO string is deterministic (not impure)
  const [startH, setStartH] = useState(() => new Date(feeding.startedAt).getHours());
  const [startM, setStartM] = useState(() => new Date(feeding.startedAt).getMinutes());
  const [endH, setEndH] = useState(() => new Date(feeding.endedAt).getHours());
  const [endM, setEndM] = useState(() => new Date(feeding.endedAt).getMinutes());
  const [milkType, setMilkType] = useState<MilkType>(feeding.milkType ?? 'BREAST');
  const [amountText, setAmountText] = useState(feeding.amountMl != null ? String(feeding.amountMl) : '');
  const [note, setNote] = useState(feeding.note ?? '');
  const [error, setError] = useState<EditError | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const times = buildEditTimes(feeding, { h: startH, m: startM }, { h: endH, m: endM });
    if (typeof times === 'string') {
      setError(times);
      return;
    }
    const amountMl = parseAmountMl(amountText);
    if (amountMl === 'invalid') {
      setError('invalidAmount');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(feeding.id, { ...times, milkType, amountMl, note: note.trim() || null });
      // On success the parent closes the sheet, which unmounts this component.
    } catch {
      setError('saveFailed');
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.overlay}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ThemedView style={styles.sheet}>
        <ThemedText type="smallBold" style={styles.title}>
          {t('feeding.edit.title')}
        </ThemedText>

        <TimeRow
          label={t('common.start')}
          h={startH}
          m={startM}
          onChangeH={setStartH}
          onChangeM={setStartM}
        />
        <TimeRow label={t('common.end')} h={endH} m={endM} onChangeH={setEndH} onChangeM={setEndM} />

        <FeedingDetailsFields
          milkType={milkType}
          onMilkTypeChange={setMilkType}
          amountText={amountText}
          onAmountTextChange={setAmountText}
          note={note}
          onNoteChange={setNote}
        />

        {error && (
          <ThemedText type="small" themeColor="danger" style={styles.error}>
            {t(ERROR_KEYS[error])}
          </ThemedText>
        )}
        <View style={styles.actions}>
          <Pressable
            style={[styles.actionButton, { backgroundColor: theme.backgroundElement }]}
            onPress={onClose}>
            <ThemedText type="small">{t('common.cancel')}</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.actionButton, { backgroundColor: theme.text }, saving && styles.disabled]}
            onPress={handleSave}
            disabled={saving}>
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              {t('common.save')}
            </ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

interface TimeRowProps {
  label: string;
  h: number;
  m: number;
  onChangeH: (v: number) => void;
  onChangeM: (v: number) => void;
}

function TimeRow({ label, h, m, onChangeH, onChangeM }: TimeRowProps) {
  return (
    <View style={styles.timeRow}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.timeLabel}>
        {label}
      </ThemedText>
      <Stepper value={h} min={0} max={23} onChange={onChangeH} pad={2} />
      <ThemedText type="smallBold">:</ThemedText>
      <Stepper value={m} min={0} max={59} onChange={onChangeM} pad={2} />
    </View>
  );
}

interface StepperProps {
  value: number;
  min: number;
  max: number;
  pad: number;
  onChange: (v: number) => void;
}

function Stepper({ value, min, max, pad, onChange }: StepperProps) {
  const theme = useTheme();
  return (
    <View style={styles.stepper}>
      <Pressable
        style={[styles.stepBtn, { backgroundColor: theme.backgroundElement }]}
        onPress={() => onChange(value <= min ? max : value - 1)}>
        <ThemedText type="smallBold">−</ThemedText>
      </Pressable>
      <ThemedText type="smallBold" style={styles.stepValue}>
        {String(value).padStart(pad, '0')}
      </ThemedText>
      <Pressable
        style={[styles.stepBtn, { backgroundColor: theme.backgroundElement }]}
        onPress={() => onChange(value >= max ? min : value + 1)}>
        <ThemedText type="smallBold">+</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Spacing.three,
    borderTopRightRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  // Wide enough for the Polish labels ("Początek").
  timeLabel: {
    width: 72,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    width: 32,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  error: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  actionButton: {
    flex: 1,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.five,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
});
