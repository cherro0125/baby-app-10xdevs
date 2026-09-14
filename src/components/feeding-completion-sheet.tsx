import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

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

const MILK_TYPES: { value: MilkType; label: string }[] = [
  { value: 'BREAST', label: 'Breast' },
  { value: 'FORMULA', label: 'Formula' },
  { value: 'PUMPED', label: 'Pumped' },
  { value: 'OTHER', label: 'Other' },
];

export function FeedingCompletionSheet({ visible, onSave, onCancel }: FeedingCompletionSheetProps) {
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
            Feeding details
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
                  themeColor={mt.value === milkType ? 'text' : 'textSecondary'}>
                  {mt.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            placeholder="Amount (ml)"
            placeholderTextColor={theme.textSecondary}
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="numeric"
          />

          <TextInput
            style={[styles.input, styles.noteInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            placeholder="Add a note…"
            placeholderTextColor={theme.textSecondary}
            value={note}
            onChangeText={setNote}
            multiline
          />

          <View style={styles.actions}>
            <Pressable
              style={[styles.actionButton, { backgroundColor: theme.backgroundElement }]}
              onPress={handleCancel}>
              <ThemedText type="small">Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.actionButton, { backgroundColor: theme.text }]}
              onPress={handleSave}>
              <ThemedText type="smallBold" style={{ color: theme.background }}>
                Save
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
