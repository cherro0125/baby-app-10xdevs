import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { LocalFeeding, MilkType } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';

interface FeedingRowProps {
  feeding: LocalFeeding;
  onDelete: (id: string) => Promise<void>;
  onEdit: (feeding: LocalFeeding) => void;
  currentUserId?: string;
  partnerLabel?: string | null;
}

const MILK_TYPE_COLORS: Record<MilkType, string> = {
  BREAST: '#000000',   // overridden by theme.text at render time
  FORMULA: '#4CAF50',
  PUMPED: '#2196F3',
  OTHER: '#9E9E9E',
};

const MILK_TYPE_LABELS: Record<MilkType, string> = {
  BREAST: 'Breast',
  FORMULA: 'Formula',
  PUMPED: 'Pumped',
  OTHER: 'Other',
};

function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function FeedingRow({ feeding, onDelete, onEdit, currentUserId, partnerLabel }: FeedingRowProps) {
  const theme = useTheme();
  const swipeableRef = useRef<Swipeable>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const authorLabel =
    currentUserId && feeding.userId !== currentUserId ? partnerLabel : null;

  function handleDeletePress() {
    swipeableRef.current?.close();
    setConfirming(true);
  }

  const badgeColor =
    feeding.milkType === 'BREAST'
      ? theme.text
      : feeding.milkType
        ? MILK_TYPE_COLORS[feeding.milkType]
        : theme.backgroundElement;

  if (confirming) {
    return (
      <ThemedView type="backgroundElement" style={styles.row}>
        <Pressable
          style={styles.confirmAction}
          disabled={deleting}
          onPress={() => {
            if (deleting) return;
            setDeleting(true);
            onDelete(feeding.id).catch(() => {
              setDeleting(false);
              setConfirming(false);
            });
          }}>
          <ThemedText type="smallBold" themeColor="danger">
            Confirm delete?
          </ThemedText>
        </Pressable>
        <Pressable style={styles.confirmAction} onPress={() => setConfirming(false)}>
          <ThemedText type="small" themeColor="textSecondary">
            Cancel
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={() => (
        <Pressable
          onPress={handleDeletePress}
          style={[styles.deleteAction, { backgroundColor: theme.danger }]}>
          <ThemedText type="smallBold" style={{ color: theme.dangerText }}>
            Delete
          </ThemedText>
        </Pressable>
      )}>
      <ThemedView type="backgroundElement" style={styles.row}>
        <Pressable style={styles.rowMain} onPress={() => onEdit(feeding)}>
          <ThemedText type="smallBold">
            {new Date(feeding.startedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDuration(feeding.durationMinutes)}
            {feeding.amountMl != null ? ` · ${feeding.amountMl} ml` : ''}
          </ThemedText>
          {authorLabel ? (
            <ThemedText type="small" themeColor="textSecondary">
              {authorLabel}
            </ThemedText>
          ) : null}
          {feeding.note ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {feeding.note}
            </ThemedText>
          ) : null}
        </Pressable>
        {feeding.milkType ? (
          <View style={[styles.badge, { backgroundColor: badgeColor }]}>
            <ThemedText
              type="small"
              style={{
                color:
                  feeding.milkType === 'BREAST' ? theme.background : '#ffffff',
                fontSize: 10,
                fontWeight: '600',
              }}>
              {MILK_TYPE_LABELS[feeding.milkType].slice(0, 3).toUpperCase()}
            </ThemedText>
          </View>
        ) : null}
      </ThemedView>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.one,
  },
  rowMain: {
    gap: Spacing.half,
    flex: 1,
  },
  badge: {
    width: 36,
    height: 28,
    borderRadius: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.two,
  },
  deleteAction: {
    width: 80,
    marginBottom: Spacing.one,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmAction: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
});
