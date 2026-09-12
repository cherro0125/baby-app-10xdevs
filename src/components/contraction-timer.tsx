import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';

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

const STRENGTH_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function ContractionTimer({ active, onStart, onStop }: ContractionTimerProps) {
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
            Start Contraction
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.elapsed}>{formatElapsed(elapsed)}</ThemedText>

      <ThemedView style={styles.strengthSection}>
        <ThemedText type="small" themeColor="textSecondary">
          Strength
        </ThemedText>
        <ThemedView style={styles.pips}>
          {STRENGTH_LEVELS.map((n) => (
            <Pressable
              key={n}
              onPress={() => setStrength(n === strength ? null : n)}
              style={[
                styles.pip,
                { backgroundColor: n === strength ? theme.text : theme.backgroundElement },
              ]}>
              <ThemedText
                type="small"
                style={{ color: n === strength ? theme.background : theme.text }}>
                {n}
              </ThemedText>
            </Pressable>
          ))}
        </ThemedView>
      </ThemedView>

      <TextInput
        style={[
          styles.noteInput,
          {
            color: theme.text,
            backgroundColor: theme.backgroundElement,
          },
        ]}
        placeholder="Add a note…"
        placeholderTextColor={theme.textSecondary}
        value={note}
        onChangeText={setNote}
        multiline
      />

      <Pressable onPress={handleStop} style={[styles.stopButton, { backgroundColor: theme.danger }]}>
        <ThemedText type="smallBold" style={{ color: theme.dangerText }}>
          Stop
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
  stopButtonText: {},
  strengthSection: {
    alignSelf: 'stretch',
    gap: Spacing.two,
  },
  pips: {
    flexDirection: 'row',
    gap: Spacing.one,
    flexWrap: 'wrap',
  },
  pip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteInput: {
    alignSelf: 'stretch',
    borderRadius: Spacing.two,
    padding: Spacing.two,
    minHeight: 64,
    fontSize: 14,
  },
});
