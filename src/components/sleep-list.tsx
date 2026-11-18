import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SleepRow } from '@/components/sleep-row';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { LocalSleep } from '@/db/types';

interface SleepListProps {
  sleeps: LocalSleep[];
  onDelete: (id: string) => Promise<void>;
  onEdit: (sleep: LocalSleep) => void;
  currentUserId?: string;
  partnerLabel?: string | null;
}

export function SleepList({ sleeps, onDelete, onEdit, currentUserId, partnerLabel }: SleepListProps) {
  const { t } = useTranslation();
  const completed = sleeps.filter((s) => s.endedAt !== null);

  if (completed.length === 0) {
    return (
      <View style={{ paddingTop: Spacing.four, alignItems: 'center' }}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('sleep.empty')}
        </ThemedText>
      </View>
    );
  }

  return (
    <View>
      {completed.map((sleep) => (
        <SleepRow
          key={sleep.id}
          sleep={sleep}
          onDelete={onDelete}
          onEdit={onEdit}
          currentUserId={currentUserId}
          partnerLabel={partnerLabel}
        />
      ))}
    </View>
  );
}
