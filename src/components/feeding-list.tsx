import { View } from 'react-native';

import { FeedingRow } from '@/components/feeding-row';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { LocalFeeding } from '@/db/types';

interface FeedingListProps {
  feedings: LocalFeeding[];
  onDelete: (id: string) => Promise<void>;
  onEdit: (feeding: LocalFeeding) => void;
  currentUserId?: string;
  partnerLabel?: string | null;
}

export function FeedingList({ feedings, onDelete, onEdit, currentUserId, partnerLabel }: FeedingListProps) {
  const completed = feedings.filter((f) => f.endedAt !== null);

  if (completed.length === 0) {
    return (
      <View style={{ paddingTop: Spacing.four, alignItems: 'center' }}>
        <ThemedText type="small" themeColor="textSecondary">
          No feedings logged yet
        </ThemedText>
      </View>
    );
  }

  return (
    <View>
      {completed.map((feeding) => (
        <FeedingRow
          key={feeding.id}
          feeding={feeding}
          onDelete={onDelete}
          onEdit={onEdit}
          currentUserId={currentUserId}
          partnerLabel={partnerLabel}
        />
      ))}
    </View>
  );
}
