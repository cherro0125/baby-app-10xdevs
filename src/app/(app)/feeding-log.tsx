import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useSession } from '@/auth/session-provider';

import { FeedingCompletionSheet } from '@/components/feeding-completion-sheet';
import type { FeedingEdit } from '@/components/feeding-edit';
import { FeedingEditSheet } from '@/components/feeding-edit-sheet';
import { FeedingList } from '@/components/feeding-list';
import { FeedingTimer } from '@/components/feeding-timer';
import { IncompleteFeedingModal } from '@/components/incomplete-feeding-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import type { LocalFeeding, MilkType } from '@/db/types';
import { useFeedings } from '@/hooks/use-feedings';
import { usePartner } from '@/hooks/use-partner';

export default function FeedingLogScreen() {
  const { t } = useTranslation();
  const { user } = useSession();
  const { partner } = usePartner();
  const partnerLabel = partner ? (partner.displayName ?? partner.email) : null;
  const { feedings, activeFeeding, isLoading, initialActiveId, start, finalize, remove, edit } =
    useFeedings(partner !== null);

  const [modalDismissed, setModalDismissed] = useState(false);
  const [pendingStop, setPendingStop] = useState<Date | null>(null);
  const [editTarget, setEditTarget] = useState<LocalFeeding | null>(null);

  const showRecoveryModal =
    !isLoading &&
    activeFeeding !== null &&
    activeFeeding.id === initialActiveId &&
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
      console.error('[FeedingLogScreen] start failed', e);
    }
  }

  function handleStop(endedAt: Date) {
    setPendingStop(endedAt);
  }

  async function handleSave(milkType: MilkType, amountMl: number | null, note: string | null) {
    if (!activeFeeding || !pendingStop) return;
    try {
      await finalize(activeFeeding.id, pendingStop, milkType, amountMl, note);
      setPendingStop(null);
    } catch (e) {
      console.error('[FeedingLogScreen] finalize failed', e);
    }
  }

  async function handleEndNow() {
    if (!activeFeeding) return;
    try {
      await finalize(activeFeeding.id, new Date(), 'BREAST', null, null);
    } catch (e) {
      console.error('[FeedingLogScreen] end-now failed', e);
    }
  }

  async function handleEditSave(id: string, changes: FeedingEdit) {
    try {
      await edit(id, changes);
      setEditTarget(null);
    } catch (e) {
      console.error('[FeedingLogScreen] edit failed', e);
      // Rethrown so the sheet stays open and shows the error.
      throw e;
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <IncompleteFeedingModal
        visible={showRecoveryModal}
        onContinue={() => setModalDismissed(true)}
        onEndNow={handleEndNow}
      />
      <FeedingCompletionSheet
        visible={pendingStop !== null}
        onSave={handleSave}
        onCancel={() => setPendingStop(null)}
      />
      <FeedingEditSheet
        feeding={editTarget}
        onClose={() => setEditTarget(null)}
        onSave={handleEditSave}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedView style={styles.container}>
          <FeedingTimer
            key={activeFeeding?.id ?? 'none'}
            active={activeFeeding}
            onStart={handleStart}
            onStop={handleStop}
          />
          <FeedingList
            feedings={feedings}
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
