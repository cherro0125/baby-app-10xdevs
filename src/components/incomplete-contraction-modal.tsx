import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface IncompleteContractionModalProps {
  visible: boolean;
  onContinue: () => void;
  onEndNow: () => void;
}

export function IncompleteContractionModal({
  visible,
  onContinue,
  onEndNow,
}: IncompleteContractionModalProps) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <ThemedView style={styles.card}>
          <ThemedText type="smallBold" style={styles.centred}>
            Contraction in progress
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centred}>
            It looks like a contraction was left running. What would you like to do?
          </ThemedText>
          <Pressable
            style={[styles.button, { backgroundColor: theme.text }]}
            onPress={onContinue}>
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              Continue timing
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.button, { backgroundColor: theme.danger }]}
            onPress={onEndNow}>
            <ThemedText type="smallBold" style={{ color: theme.dangerText }}>
              End now
            </ThemedText>
          </Pressable>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'stretch',
  },
  centred: {
    textAlign: 'center',
  },
  button: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.five,
    alignItems: 'center',
  },
});
