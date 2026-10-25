import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface TimeRowProps {
  label: string;
  h: number;
  m: number;
  onChangeH: (v: number) => void;
  onChangeM: (v: number) => void;
}

/** Hour and minute steppers shared by the edit sheets. */
export function TimeRow({ label, h, m, onChangeH, onChangeM }: TimeRowProps) {
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
});
