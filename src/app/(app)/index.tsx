import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useSession } from '@/auth/session-provider';

import { ContractionEditSheet } from '@/components/contraction-edit-sheet';
import { ContractionList } from '@/components/contraction-list';
import { ContractionTimer } from '@/components/contraction-timer';
import type { ContractionEdit } from '@/components/entry-edit';
import { FiveOneOneBanner } from '@/components/five-one-one-banner';
import { IncompleteContractionModal } from '@/components/incomplete-contraction-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import type { LocalContraction } from '@/db/types';
import { useContractions } from '@/hooks/use-contractions';
import { usePartner } from '@/hooks/use-partner';
import { computeFiveOneOne } from '@/utils/five-one-one';

export default function ContractionsScreen() {
  const { t } = useTranslation();
  const { user } = useSession();
  const { partner } = usePartner();
  const partnerLabel = partner ? (partner.displayName ?? partner.email) : null;
  const { contractions, activeContraction, isLoading, initialActiveId, start, finalize, remove, edit } =
    useContractions(partner !== null);

  const [modalDismissed, setModalDismissed] = useState(false);
  const [editTarget, setEditTarget] = useState<LocalContraction | null>(null);

  // Show crash-recovery modal only when the active contraction was present at initial load
  // (initialActiveId is the id captured when the DB first loaded — undefined until loaded).
  const showRecoveryModal =
    !isLoading &&
    activeContraction !== null &&
    activeContraction.id === initialActiveId &&
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
      console.error('[ContractionsScreen] start failed', e);
    }
  }

  async function handleStop(endedAt: Date, strength: number | null, note: string | null) {
    if (!activeContraction) return;
    try {
      await finalize(activeContraction.id, endedAt, strength, note);
    } catch (e) {
      console.error('[ContractionsScreen] finalize failed', e);
    }
  }

  async function handleEndNow() {
    if (!activeContraction) return;
    try {
      await finalize(activeContraction.id, new Date(), null, null);
    } catch (e) {
      console.error('[ContractionsScreen] end-now failed', e);
    }
  }

  async function handleEditSave(id: string, changes: ContractionEdit) {
    try {
      await edit(id, changes);
      setEditTarget(null);
    } catch (e) {
      console.error('[ContractionsScreen] edit failed', e);
      // Rethrown so the sheet stays open and shows the error.
      throw e;
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <IncompleteContractionModal
        visible={showRecoveryModal}
        onContinue={() => setModalDismissed(true)}
        onEndNow={handleEndNow}
      />
      <ContractionEditSheet
        contraction={editTarget}
        onClose={() => setEditTarget(null)}
        onSave={handleEditSave}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedView style={styles.container}>
          <FiveOneOneBanner status={computeFiveOneOne(contractions).status} />
          <ContractionTimer
            key={activeContraction?.id ?? 'none'}
            active={activeContraction}
            onStart={handleStart}
            onStop={handleStop}
          />
          <ContractionList
            contractions={contractions}
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
