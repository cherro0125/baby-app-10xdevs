import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { FeedingDetailsFields } from '@/components/feeding-details-fields';
import { parseAmountMl } from '@/components/feeding-edit';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { MilkType } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';

interface FeedingCompletionSheetProps {
  visible: boolean;
  onSave: (milkType: MilkType, amountMl: number | null, note: string | null) => void;
  onCancel: () => void;
}

export function FeedingCompletionSheet({ visible, onSave, onCancel }: FeedingCompletionSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [milkType, setMilkType] = useState<MilkType>('BREAST');
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [invalidAmount, setInvalidAmount] = useState(false);

  function reset() {
    setMilkType('BREAST');
    setAmountText('');
    setNote('');
    setInvalidAmount(false);
  }

  function handleSave() {
    const amountMl = parseAmountMl(amountText);
    if (amountMl === 'invalid') {
      setInvalidAmount(true);
      return;
    }
    onSave(milkType, amountMl, note.trim() || null);
    reset();
  }

  function handleCancel() {
    reset();
    onCancel();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleCancel}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ThemedView style={styles.sheet}>
          <ThemedText type="smallBold" style={styles.title}>
            {t('feeding.details')}
          </ThemedText>

          <FeedingDetailsFields
            milkType={milkType}
            onMilkTypeChange={setMilkType}
            amountText={amountText}
            onAmountTextChange={setAmountText}
            note={note}
            onNoteChange={setNote}
          />

          {invalidAmount && (
            <ThemedText type="small" themeColor="danger" style={styles.error}>
              {t('feeding.edit.invalidAmount')}
            </ThemedText>
          )}
          <View style={styles.actions}>
            <Pressable
              style={[styles.actionButton, { backgroundColor: theme.backgroundElement }]}
              onPress={handleCancel}>
              <ThemedText type="small">{t('common.cancel')}</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.actionButton, { backgroundColor: theme.text }]}
              onPress={handleSave}>
              <ThemedText type="smallBold" style={{ color: theme.background }}>
                {t('common.save')}
              </ThemedText>
            </Pressable>
          </View>
        </ThemedView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Spacing.three,
    borderTopRightRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
  },
  error: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  actionButton: {
    flex: 1,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.five,
    alignItems: 'center',
  },
});
