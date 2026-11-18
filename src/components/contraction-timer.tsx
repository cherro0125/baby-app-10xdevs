import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ContractionDetailsFields } from '@/components/contraction-details-fields';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { LocalContraction } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';

interface ContractionTimerProps {
  active: LocalContraction | null;
  onStart: () => void;
  onStop: (endedAt: Date, strength: number | null, note: string | null) => void;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ContractionTimer({ active, onStart, onStop }: ContractionTimerProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  // lazy initialiser reads Date.now() once at mount (not in render) — satisfies purity rules
  // parent passes key={active?.id ?? 'none'} so this mounts fresh for each contraction
  const [elapsed, setElapsed] = useState(() =>
    active ? Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 1000) : 0,
  );
  const [strength, setStrength] = useState<number | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!active) return;
    const startMs = new Date(active.startedAt).getTime();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMs) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  function handleStop() {
    onStop(new Date(), strength, note.trim() || null);
  }

  if (!active) {
    return (
      <ThemedView style={styles.container}>
        <Pressable onPress={onStart} style={[styles.startButton, { backgroundColor: theme.text }]}>
          <ThemedText type="smallBold" style={{ color: theme.background }}>
            {t('contractions.startButton')}
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.elapsed}>{formatElapsed(elapsed)}</ThemedText>

      <ContractionDetailsFields
        strength={strength}
        onStrengthChange={setStrength}
        note={note}
        onNoteChange={setNote}
      />

      <Pressable onPress={handleStop} style={[styles.stopButton, { backgroundColor: theme.danger }]}>
        <ThemedText type="smallBold" style={{ color: theme.dangerText }}>
          {t('common.stop')}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.four,
  },
  elapsed: {
    fontSize: 72,
    lineHeight: 80,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  startButton: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.six,
    borderRadius: Spacing.five,
    alignItems: 'center',
  },
  stopButton: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.six,
    borderRadius: Spacing.five,
    alignItems: 'center',
  },
});
