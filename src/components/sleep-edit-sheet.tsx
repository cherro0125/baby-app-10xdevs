import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { buildEditTimes, type SleepEdit } from '@/components/entry-edit';
import { SleepDetailsFields } from '@/components/sleep-details-fields';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TimeRow } from '@/components/time-row';
import { Spacing } from '@/constants/theme';
import type { LocalSleep, SleepType } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';

type CompletedSleep = LocalSleep & { endedAt: string };

interface SleepEditSheetProps {
  sleep: LocalSleep | null;
  onClose: () => void;
  onSave: (id: string, changes: SleepEdit) => Promise<void>;
}

export function SleepEditSheet({ sleep, onClose, onSave }: SleepEditSheetProps) {
  // Only completed sleeps are listed, so a sleep without an end is never edited here.
  const completed = sleep?.endedAt ? (sleep as CompletedSleep) : null;
  return (
    <Modal visible={completed !== null} transparent animationType="slide" onRequestClose={onClose}>
      {completed && (
        <SleepEditSheetInner
          key={completed.id}
          sleep={completed}
          onClose={onClose}
          onSave={onSave}
        />
      )}
    </Modal>
  );
}

const ERROR_KEYS = {
  endBeforeStart: 'timeEdit.endAfterStart',
  tooLong: 'sleep.edit.tooLong',
  saveFailed: 'feeding.edit.saveFailed',
} as const;

type EditError = keyof typeof ERROR_KEYS;

interface InnerProps {
  sleep: CompletedSleep;
  onClose: () => void;
  onSave: (id: string, changes: SleepEdit) => Promise<void>;
}

function SleepEditSheetInner({ sleep, onClose, onSave }: InnerProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  // Lazy initialisers: constructing from a known ISO string is deterministic (not impure)
  const [startH, setStartH] = useState(() => new Date(sleep.startedAt).getHours());
  const [startM, setStartM] = useState(() => new Date(sleep.startedAt).getMinutes());
  const [endH, setEndH] = useState(() => new Date(sleep.endedAt).getHours());
  const [endM, setEndM] = useState(() => new Date(sleep.endedAt).getMinutes());
  const [sleepType, setSleepType] = useState<SleepType>(sleep.sleepType ?? 'NAP');
  const [note, setNote] = useState(sleep.note ?? '');
  const [error, setError] = useState<EditError | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const times = buildEditTimes(sleep, { h: startH, m: startM }, { h: endH, m: endM });
    if (typeof times === 'string') {
      setError(times);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(sleep.id, { ...times, sleepType, note: note.trim() || null });
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
          {t('sleep.edit.title')}
        </ThemedText>

        <TimeRow
          label={t('common.start')}
          h={startH}
          m={startM}
          onChangeH={setStartH}
          onChangeM={setStartM}
        />
        <TimeRow label={t('common.end')} h={endH} m={endM} onChangeH={setEndH} onChangeM={setEndM} />

        <SleepDetailsFields
          sleepType={sleepType}
          onSleepTypeChange={setSleepType}
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
