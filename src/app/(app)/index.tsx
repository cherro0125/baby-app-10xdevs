import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ContractionTimer } from '@/components/contraction-timer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useContractions } from '@/hooks/use-contractions';

export default function ContractionsScreen() {
  const { activeContraction, isLoading, start, finalize } = useContractions();

  if (isLoading) {
    return (
      <ThemedView style={styles.loading}>
        <ThemedText type="small" themeColor="textSecondary">
          Loading…
        </ThemedText>
      </ThemedView>
    );
  }

  function handleStart() {
    start(new Date());
  }

  function handleStop(endedAt: Date, strength: number | null, note: string | null) {
    if (!activeContraction) return;
    finalize(activeContraction.id, endedAt, strength, note);
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
          {/* ContractionList — Phase 4 */}
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
