import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ContractionList } from '@/components/contraction-list';
import { ContractionTimer } from '@/components/contraction-timer';
import { FiveOneOneBanner } from '@/components/five-one-one-banner';
import { IncompleteContractionModal } from '@/components/incomplete-contraction-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TimeEditSheet } from '@/components/time-edit-sheet';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import type { LocalContraction } from '@/db/types';
import { useContractions } from '@/hooks/use-contractions';
import { computeFiveOneOne } from '@/utils/five-one-one';

export default function ContractionsScreen() {
  const { contractions, activeContraction, isLoading, initialActiveId, start, finalize, remove, edit } =
    useContractions(false);

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
          Loading…
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

  async function handleEditConfirm(
    id: string,
    patch: { startedAt?: Date; endedAt?: Date },
  ) {
    try {
      await edit(id, patch);
      setEditTarget(null);
    } catch (e) {
      console.error('[ContractionsScreen] edit failed', e);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <IncompleteContractionModal
        visible={showRecoveryModal}
        onContinue={() => setModalDismissed(true)}
        onEndNow={handleEndNow}
      />
      <TimeEditSheet
        contraction={editTarget}
        onClose={() => setEditTarget(null)}
        onConfirm={handleEditConfirm}
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
