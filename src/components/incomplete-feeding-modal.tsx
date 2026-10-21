import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface IncompleteFeedingModalProps {
  visible: boolean;
  onContinue: () => void;
  onEndNow: () => void;
}

export function IncompleteFeedingModal({
  visible,
  onContinue,
  onEndNow,
}: IncompleteFeedingModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <ThemedView style={styles.card}>
          <ThemedText type="smallBold" style={styles.centred}>
            {t('feeding.incomplete.title')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centred}>
            {t('feeding.incomplete.body')}
          </ThemedText>
          <Pressable
            style={[styles.button, { backgroundColor: theme.text }]}
            onPress={onContinue}>
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              {t('common.continueTiming')}
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.button, { backgroundColor: theme.danger }]}
            onPress={onEndNow}>
            <ThemedText type="smallBold" style={{ color: theme.dangerText }}>
              {t('common.endNow')}
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
