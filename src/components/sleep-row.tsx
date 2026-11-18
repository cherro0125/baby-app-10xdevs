import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { SLEEP_TYPE_KEYS } from '@/components/sleep-types';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { LocalSleep, SleepType } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import { formatClockTime, formatDurationMinutes } from '@/i18n/format';

interface SleepRowProps {
  sleep: LocalSleep;
  onDelete: (id: string) => Promise<void>;
  onEdit: (sleep: LocalSleep) => void;
  currentUserId?: string;
  partnerLabel?: string | null;
}

const SLEEP_TYPE_COLORS: Record<SleepType, string> = {
  NAP: '#2196F3',
  NIGHT: '#7E57C2',
  OTHER: '#9E9E9E',
};

function formatDuration(t: TFunction, minutes: number | null): string {
  if (minutes === null) return '—';
  return formatDurationMinutes(t, minutes);
}

export function SleepRow({ sleep, onDelete, onEdit, currentUserId, partnerLabel }: SleepRowProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const swipeableRef = useRef<Swipeable>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const authorLabel =
    currentUserId && sleep.userId !== currentUserId ? partnerLabel : null;

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
            onDelete(sleep.id).catch(() => {
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
        <Pressable style={styles.rowMain} onPress={() => onEdit(sleep)}>
          <ThemedText type="smallBold">
            {formatClockTime(new Date(sleep.startedAt), i18n.language)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDuration(t, sleep.durationMinutes)}
          </ThemedText>
          {authorLabel ? (
            <ThemedText type="small" themeColor="textSecondary">
              {authorLabel}
            </ThemedText>
          ) : null}
          {sleep.note ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {sleep.note}
            </ThemedText>
          ) : null}
        </Pressable>
        {sleep.sleepType ? (
          <View style={[styles.badge, { backgroundColor: SLEEP_TYPE_COLORS[sleep.sleepType] }]}>
            <ThemedText
              type="small"
              style={{
                color: '#ffffff',
                fontSize: 10,
                fontWeight: '600',
              }}>
              {t(`sleep.typeShort.${SLEEP_TYPE_KEYS[sleep.sleepType]}`)}
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
