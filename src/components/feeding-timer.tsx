import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { LocalFeeding } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';

interface FeedingTimerProps {
  active: LocalFeeding | null;
  onStart: () => void;
  onStop: (endedAt: Date) => void;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function FeedingTimer({ active, onStart, onStop }: FeedingTimerProps) {
  const theme = useTheme();
  const [elapsed, setElapsed] = useState(() =>
    active ? Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 1000) : 0,
  );

  useEffect(() => {
    if (!active) return;
    const startMs = new Date(active.startedAt).getTime();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMs) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  if (!active) {
    return (
      <ThemedView style={styles.container}>
        <Pressable onPress={onStart} style={[styles.startButton, { backgroundColor: theme.text }]}>
          <ThemedText type="smallBold" style={{ color: theme.background }}>
            Start Feeding
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.elapsed}>{formatElapsed(elapsed)}</ThemedText>
      <Pressable onPress={() => onStop(new Date())} style={[styles.stopButton, { backgroundColor: theme.danger }]}>
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
});
