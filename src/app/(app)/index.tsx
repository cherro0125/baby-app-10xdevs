import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ContractionList } from '@/components/contraction-list';
import { ContractionTimer } from '@/components/contraction-timer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useContractions } from '@/hooks/use-contractions';

export default function ContractionsScreen() {
  const { contractions, activeContraction, isLoading, start, finalize, remove } = useContractions();

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedView style={styles.container}>
          <ContractionTimer
            key={activeContraction?.id ?? 'none'}
            active={activeContraction}
            onStart={handleStart}
            onStop={handleStop}
          />
          <ContractionList contractions={contractions} onDelete={remove} />
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
