import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { MILK_TYPES } from '@/components/milk-types';
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

  function handleSave() {
    const amountMl = amountText.trim() ? parseInt(amountText.trim(), 10) || null : null;
    onSave(milkType, amountMl, note.trim() || null);
    setMilkType('BREAST');
    setAmountText('');
    setNote('');
  }

  function handleCancel() {
    setMilkType('BREAST');
    setAmountText('');
    setNote('');
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

          <View style={styles.segmentedControl}>
            {MILK_TYPES.map((mt) => (
              <Pressable
                key={mt.value}
                onPress={() => setMilkType(mt.value)}
                style={[
                  styles.segment,
                  {
                    backgroundColor:
                      mt.value === milkType ? theme.backgroundSelected : theme.backgroundElement,
                  },
                ]}>
                <ThemedText
                  type="small"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  themeColor={mt.value === milkType ? 'text' : 'textSecondary'}>
                  {t(`feeding.milkType.${mt.key}`)}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            placeholder={t('feeding.amountPlaceholder')}
            placeholderTextColor={theme.textSecondary}
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="numeric"
          />

          <TextInput
            style={[styles.input, styles.noteInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            placeholder={t('common.addNote')}
            placeholderTextColor={theme.textSecondary}
            value={note}
            onChangeText={setNote}
            multiline
          />

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
  segmentedControl: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  segment: {
    flex: 1,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
  input: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
    fontSize: 14,
  },
  noteInput: {
    minHeight: 64,
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
