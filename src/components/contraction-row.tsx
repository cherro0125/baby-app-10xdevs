import { useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { LocalContraction } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import { formatClockTime, formatDurationSeconds } from '@/i18n/format';

interface ContractionRowProps {
  contraction: LocalContraction;
  gapSeconds: number | null;
  onDelete: (id: string) => Promise<void>;
  onEdit: (contraction: LocalContraction) => void;
  authorLabel?: string | null;
}

function formatDuration(t: TFunction, seconds: number | null): string {
  if (seconds === null) return '—';
  return formatDurationSeconds(t, seconds);
}

function formatGap(t: TFunction, seconds: number | null): string {
  if (seconds === null) return t('contractions.firstLogged');
  return t('contractions.apart', { min: Math.round(seconds / 60) });
}

export function ContractionRow({ contraction, gapSeconds, onDelete, onEdit, authorLabel }: ContractionRowProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const swipeableRef = useRef<Swipeable>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function handleDeletePress() {
    swipeableRef.current?.close();
    setConfirming(true);
  }

  if (confirming) {
    return (
      <ThemedView type="backgroundElement" style={styles.row}>
        <Pressable
          style={styles.confirmAction}
          disabled={deleting}
          onPress={() => {
            if (deleting) return;
            setDeleting(true);
            onDelete(contraction.id).catch(() => {
              setDeleting(false);
              setConfirming(false);
            });
          }}>
          <ThemedText type="smallBold" themeColor="danger">
            {t('common.confirmDelete')}
          </ThemedText>
        </Pressable>
        <Pressable style={styles.confirmAction} onPress={() => setConfirming(false)}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('common.cancel')}
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
            {t('common.delete')}
          </ThemedText>
        </Pressable>
      )}>
      <ThemedView type="backgroundElement" style={styles.row}>
        <Pressable style={styles.rowMain} onPress={() => onEdit(contraction)}>
          <ThemedText type="smallBold">
            {formatClockTime(new Date(contraction.startedAt), i18n.language)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDuration(t, contraction.durationSeconds)} · {formatGap(t, gapSeconds)}
          </ThemedText>
          {authorLabel ? (
            <ThemedText type="small" themeColor="textSecondary">
              {authorLabel}
            </ThemedText>
          ) : null}
          {contraction.note ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {contraction.note}
            </ThemedText>
          ) : null}
        </Pressable>
        {contraction.strength !== null && (
          <ThemedView type="backgroundSelected" style={styles.strengthBadge}>
            <ThemedText type="smallBold">{contraction.strength}</ThemedText>
          </ThemedView>
        )}
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
  },
  strengthBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
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
