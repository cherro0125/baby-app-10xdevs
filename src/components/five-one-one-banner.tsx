import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { FiveOneOneStatus } from '@/utils/five-one-one';
import { useTheme } from '@/hooks/use-theme';

interface FiveOneOneBannerProps {
  status: FiveOneOneStatus;
}

const LABEL_KEYS = {
  idle: 'contractions.banner.none',
  tracking: 'contractions.banner.recording',
  alert: 'contractions.banner.goNow',
} as const satisfies Record<FiveOneOneStatus, string>;

export function FiveOneOneBanner({ status }: FiveOneOneBannerProps) {
  const { t } = useTranslation();
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
        {t(LABEL_KEYS[status])}
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
