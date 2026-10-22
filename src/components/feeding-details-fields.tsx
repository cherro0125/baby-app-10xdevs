import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { MILK_TYPES } from '@/components/milk-types';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { MilkType } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';

interface FeedingDetailsFieldsProps {
  milkType: MilkType;
  onMilkTypeChange: (milkType: MilkType) => void;
  amountText: string;
  onAmountTextChange: (text: string) => void;
  note: string;
  onNoteChange: (note: string) => void;
}

/** Milk type, amount and note inputs shared by the completion and edit sheets. */
export function FeedingDetailsFields({
  milkType,
  onMilkTypeChange,
  amountText,
  onAmountTextChange,
  note,
  onNoteChange,
}: FeedingDetailsFieldsProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <>
      <View style={styles.segmentedControl}>
        {MILK_TYPES.map((mt) => (
          <Pressable
            key={mt.value}
            onPress={() => onMilkTypeChange(mt.value)}
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
        onChangeText={onAmountTextChange}
        keyboardType="numeric"
      />

      <TextInput
        style={[styles.input, styles.noteInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        placeholder={t('common.addNote')}
        placeholderTextColor={theme.textSecondary}
        value={note}
        onChangeText={onNoteChange}
        multiline
      />
    </>
  );
}

const styles = StyleSheet.create({
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
});
