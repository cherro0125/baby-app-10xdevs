import { FlatList, StyleSheet } from 'react-native';

import { ContractionRow } from '@/components/contraction-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { LocalContraction } from '@/db/types';

interface ContractionListProps {
  contractions: LocalContraction[];
  onDelete: (id: string) => void;
}

function gapSecondsToPrevious(contractions: LocalContraction[], index: number): number | null {
  const previous = contractions[index + 1];
  if (!previous) return null;
  const current = contractions[index];
  return Math.round(
    (new Date(current.startedAt).getTime() - new Date(previous.startedAt).getTime()) / 1000,
  );
}

export function ContractionList({ contractions, onDelete }: ContractionListProps) {
  if (contractions.length === 0) {
    return (
      <ThemedView style={styles.empty}>
        <ThemedText type="small" themeColor="textSecondary">
          No contractions recorded yet
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <FlatList
      data={contractions}
      keyExtractor={(item) => item.id}
      scrollEnabled={false}
      style={styles.list}
      renderItem={({ item, index }) => (
        <ContractionRow
          contraction={item}
          gapSeconds={gapSecondsToPrevious(contractions, index)}
          onDelete={onDelete}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    paddingVertical: Spacing.five,
  },
  list: {
    alignSelf: 'stretch',
    marginTop: Spacing.three,
  },
});
