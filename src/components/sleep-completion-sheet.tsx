import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SleepDetailsFields } from '@/components/sleep-details-fields';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { SleepType } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';

interface SleepCompletionSheetProps {
  visible: boolean;
  onSave: (sleepType: SleepType, note: string | null) => void;
  onCancel: () => void;
}

export function SleepCompletionSheet({ visible, onSave, onCancel }: SleepCompletionSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [sleepType, setSleepType] = useState<SleepType>('NAP');
  const [note, setNote] = useState('');

  function reset() {
    setSleepType('NAP');
    setNote('');
  }

  function handleSave() {
    onSave(sleepType, note.trim() || null);
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
            {t('sleep.details')}
          </ThemedText>

          <SleepDetailsFields
            sleepType={sleepType}
            onSleepTypeChange={setSleepType}
            note={note}
            onNoteChange={setNote}
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
