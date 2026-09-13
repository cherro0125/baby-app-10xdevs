import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { FiveOneOneStatus } from '@/utils/five-one-one';
import { useTheme } from '@/hooks/use-theme';

interface FiveOneOneBannerProps {
  status: FiveOneOneStatus;
}

const LABELS: Record<FiveOneOneStatus, string> = {
  idle: 'No contractions yet',
  tracking: 'Contractions recorded — keep timing',
  alert: 'Pattern detected — may be time to go to the hospital',
};

export function FiveOneOneBanner({ status }: FiveOneOneBannerProps) {
  const theme = useTheme();

  const bg =
    status === 'alert'
      ? theme.danger
      : status === 'tracking'
        ? theme.backgroundSelected
        : theme.backgroundElement;

  const textColor =
    status === 'alert' ? theme.dangerText : status === 'tracking' ? theme.text : theme.textSecondary;

  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <ThemedText type="small" style={[styles.label, { color: textColor }]}>
        {LABELS[status]}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: Spacing.five,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: Spacing.three,
    marginBottom: Spacing.one,
  },
  label: {
    textAlign: 'center',
  },
});
