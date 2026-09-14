import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { LocalFeeding } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';

interface FeedingTimeEditSheetProps {
  feeding: LocalFeeding | null;
  onClose: () => void;
  onConfirm: (id: string, patch: { startedAt?: Date; endedAt?: Date }) => void;
}

export function FeedingTimeEditSheet({ feeding, onClose, onConfirm }: FeedingTimeEditSheetProps) {
  return (
    <Modal visible={feeding !== null} transparent animationType="slide" onRequestClose={onClose}>
      {feeding && (
        <FeedingTimeEditSheetInner
          key={feeding.id}
          feeding={feeding}
          onClose={onClose}
          onConfirm={onConfirm}
        />
      )}
    </Modal>
  );
}

interface InnerProps {
  feeding: LocalFeeding;
  onClose: () => void;
  onConfirm: (id: string, patch: { startedAt?: Date; endedAt?: Date }) => void;
}

function FeedingTimeEditSheetInner({ feeding, onClose, onConfirm }: InnerProps) {
  const theme = useTheme();
  const startDate = new Date(feeding.startedAt);
  const [startH, setStartH] = useState(() => startDate.getHours());
  const [startM, setStartM] = useState(() => startDate.getMinutes());

  const endDate = feeding.endedAt ? new Date(feeding.endedAt) : null;
  const [endH, setEndH] = useState(() => endDate?.getHours() ?? 0);
  const [endM, setEndM] = useState(() => endDate?.getMinutes() ?? 0);
  const [error, setError] = useState<string | null>(null);

  const isActive = !feeding.endedAt;

  function handleConfirm() {
    const patch: { startedAt?: Date; endedAt?: Date } = {};
    if (!isActive) {
      const newStart = new Date(feeding.startedAt);
      newStart.setHours(startH, startM, 0, 0);
      patch.startedAt = newStart;
    }
    if (endDate) {
      const refStart = patch.startedAt ?? new Date(feeding.startedAt);
      const newEnd = new Date(feeding.endedAt!);
      newEnd.setHours(endH, endM, 0, 0);
      if (newEnd < refStart) {
        newEnd.setDate(newEnd.getDate() + 1);
      }
      if (newEnd <= refStart) {
        setError('End must be after start');
        return;
      }
      patch.endedAt = newEnd;
    }
    setError(null);
    onConfirm(feeding.id, patch);
  }

  return (
    <View style={styles.overlay}>
      <ThemedView style={styles.sheet}>
        <ThemedText type="smallBold" style={styles.title}>
          Edit times
        </ThemedText>

        {isActive ? (
          <View style={styles.timeRow}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.timeLabel}>
              Start
            </ThemedText>
            <ThemedText type="smallBold">
              {new Date(feeding.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary"> (stop first to edit)</ThemedText>
          </View>
        ) : (
          <TimeRow
            label="Start"
            h={startH}
            m={startM}
            onChangeH={setStartH}
            onChangeM={setStartM}
          />
        )}
        {endDate && (
          <TimeRow label="End" h={endH} m={endM} onChangeH={setEndH} onChangeM={setEndM} />
        )}

        {error && (
          <ThemedText type="small" themeColor="danger" style={styles.error}>
            {error}
          </ThemedText>
        )}
        <View style={styles.actions}>
          <Pressable
            style={[styles.actionButton, { backgroundColor: theme.backgroundElement }]}
            onPress={onClose}>
            <ThemedText type="small">Cancel</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.actionButton, { backgroundColor: theme.text }]}
            onPress={handleConfirm}>
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              Confirm
            </ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    </View>
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
  timeLabel: {
    width: 40,
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
});
