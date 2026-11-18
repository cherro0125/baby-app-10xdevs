import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useSession } from '@/auth/session-provider';

import type { SleepEdit } from '@/components/entry-edit';
import { IncompleteSleepModal } from '@/components/incomplete-sleep-modal';
import { SleepCompletionSheet } from '@/components/sleep-completion-sheet';
import { SleepEditSheet } from '@/components/sleep-edit-sheet';
import { SleepList } from '@/components/sleep-list';
import { SleepTimer } from '@/components/sleep-timer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import type { LocalSleep, SleepType } from '@/db/types';
import { usePartner } from '@/hooks/use-partner';
import { useSleeps } from '@/hooks/use-sleeps';

export default function SleepLogScreen() {
  const { t } = useTranslation();
  const { user } = useSession();
  const { partner } = usePartner();
  const partnerLabel = partner ? (partner.displayName ?? partner.email) : null;
  const { sleeps, activeSleep, isLoading, initialActiveId, start, finalize, remove, edit } =
    useSleeps(partner !== null);

  const [modalDismissed, setModalDismissed] = useState(false);
  const [pendingStop, setPendingStop] = useState<Date | null>(null);
  const [editTarget, setEditTarget] = useState<LocalSleep | null>(null);

  const showRecoveryModal =
    !isLoading &&
    activeSleep !== null &&
    activeSleep.id === initialActiveId &&
    !modalDismissed;

  if (isLoading) {
    return (
      <ThemedView style={styles.loading}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('common.loading')}
        </ThemedText>
      </ThemedView>
    );
  }

  async function handleStart() {
    try {
      await start(new Date());
    } catch (e) {
      console.error('[SleepLogScreen] start failed', e);
    }
  }

  function handleStop(endedAt: Date) {
    setPendingStop(endedAt);
  }

  async function handleSave(sleepType: SleepType, note: string | null) {
    if (!activeSleep || !pendingStop) return;
    try {
      await finalize(activeSleep.id, pendingStop, sleepType, note);
      setPendingStop(null);
    } catch (e) {
      console.error('[SleepLogScreen] finalize failed', e);
    }
  }

  function handleEndNow() {
    // A sleep left running is often a night, so let the user pick the type as with Stop
    setModalDismissed(true);
    setPendingStop(new Date());
  }

  async function handleEditSave(id: string, changes: SleepEdit) {
    try {
      await edit(id, changes);
      setEditTarget(null);
    } catch (e) {
      console.error('[SleepLogScreen] edit failed', e);
      // Rethrown so the sheet stays open and shows the error.
      throw e;
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <IncompleteSleepModal
        visible={showRecoveryModal}
        onContinue={() => setModalDismissed(true)}
        onEndNow={handleEndNow}
      />
      <SleepCompletionSheet
        visible={pendingStop !== null}
        onSave={handleSave}
        onCancel={() => setPendingStop(null)}
      />
      <SleepEditSheet
        sleep={editTarget}
        onClose={() => setEditTarget(null)}
        onSave={handleEditSave}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedView style={styles.container}>
          <SleepTimer
            key={activeSleep?.id ?? 'none'}
            active={activeSleep}
            onStart={handleStart}
            onStop={handleStop}
          />
          <SleepList
            sleeps={sleeps}
            onDelete={remove}
            onEdit={setEditTarget}
            currentUserId={partner !== null ? (user?.id ?? '') : undefined}
            partnerLabel={partnerLabel}
          />
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingBottom: BottomTabInset + Spacing.three,
  },
  container: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
  },
});
