import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ContractionDetailsFields } from '@/components/contraction-details-fields';
import { buildEditTimes, type ContractionEdit } from '@/components/entry-edit';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TimeRow } from '@/components/time-row';
import { Spacing } from '@/constants/theme';
import type { LocalContraction } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import { formatClockTime } from '@/i18n/format';

type CompletedContraction = LocalContraction & { endedAt: string };

interface ContractionEditSheetProps {
  contraction: LocalContraction | null;
  onClose: () => void;
  onSave: (id: string, changes: ContractionEdit) => Promise<void>;
}

export function ContractionEditSheet({ contraction, onClose, onSave }: ContractionEditSheetProps) {
  return (
    <Modal visible={contraction !== null} transparent animationType="slide" onRequestClose={onClose}>
      {contraction &&
        (contraction.endedAt ? (
          <ContractionEditSheetInner
            key={contraction.id}
            contraction={contraction as CompletedContraction}
            onClose={onClose}
            onSave={onSave}
          />
        ) : (
          <RunningContractionSheet contraction={contraction} onClose={onClose} />
        ))}
    </Modal>
  );
}

const ERROR_KEYS = {
  endBeforeStart: 'timeEdit.endAfterStart',
  tooLong: 'contractions.edit.tooLong',
  saveFailed: 'feeding.edit.saveFailed',
} as const;

type EditError = keyof typeof ERROR_KEYS;

interface InnerProps {
  contraction: CompletedContraction;
  onClose: () => void;
  onSave: (id: string, changes: ContractionEdit) => Promise<void>;
}

function ContractionEditSheetInner({ contraction, onClose, onSave }: InnerProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  // Lazy initialisers: constructing from a known ISO string is deterministic (not impure)
  const [startH, setStartH] = useState(() => new Date(contraction.startedAt).getHours());
  const [startM, setStartM] = useState(() => new Date(contraction.startedAt).getMinutes());
  const [endH, setEndH] = useState(() => new Date(contraction.endedAt).getHours());
  const [endM, setEndM] = useState(() => new Date(contraction.endedAt).getMinutes());
  const [strength, setStrength] = useState<number | null>(contraction.strength);
  const [note, setNote] = useState(contraction.note ?? '');
  const [error, setError] = useState<EditError | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const times = buildEditTimes(contraction, { h: startH, m: startM }, { h: endH, m: endM });
    if (typeof times === 'string') {
      setError(times);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(contraction.id, { ...times, strength, note: note.trim() || null });
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
          {t('contractions.edit.title')}
        </ThemedText>

        <TimeRow
          label={t('common.start')}
          h={startH}
          m={startM}
          onChangeH={setStartH}
          onChangeM={setStartM}
        />
        <TimeRow label={t('common.end')} h={endH} m={endM} onChangeH={setEndH} onChangeM={setEndM} />

        <ContractionDetailsFields
          strength={strength}
          onStrengthChange={setStrength}
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

/** The running contraction can't be edited yet: its start is shown read-only until it is stopped. */
function RunningContractionSheet({
  contraction,
  onClose,
}: {
  contraction: LocalContraction;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();

  return (
    <View style={styles.overlay}>
      <ThemedView style={styles.sheet}>
        <ThemedText type="smallBold" style={styles.title}>
          {t('contractions.edit.title')}
        </ThemedText>

        <View style={styles.timeRow}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.timeLabel}>
            {t('common.start')}
          </ThemedText>
          <ThemedText type="smallBold">
            {formatClockTime(new Date(contraction.startedAt), i18n.language)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            {t('timeEdit.stopFirst')}
          </ThemedText>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[styles.actionButton, { backgroundColor: theme.backgroundElement }]}
            onPress={onClose}>
            <ThemedText type="small">{t('common.cancel')}</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
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
  // Matches TimeRow's label, wide enough for the Polish labels ("Początek").
  timeLabel: {
    width: 72,
  },
  // Lets the longer Polish hint wrap instead of running off narrow screens.
  hint: {
    flexShrink: 1,
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
