import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SLEEP_TYPES } from '@/components/sleep-types';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { SleepType } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';

interface SleepDetailsFieldsProps {
  sleepType: SleepType;
  onSleepTypeChange: (sleepType: SleepType) => void;
  note: string;
  onNoteChange: (note: string) => void;
}

/** Sleep type and note inputs shared by the completion and edit sheets. */
export function SleepDetailsFields({
  sleepType,
  onSleepTypeChange,
  note,
  onNoteChange,
}: SleepDetailsFieldsProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <>
      <View style={styles.segmentedControl}>
        {SLEEP_TYPES.map((st) => (
          <Pressable
            key={st.value}
            onPress={() => onSleepTypeChange(st.value)}
            style={[
              styles.segment,
              {
                backgroundColor:
                  st.value === sleepType ? theme.backgroundSelected : theme.backgroundElement,
              },
            ]}>
            <ThemedText
              type="small"
              numberOfLines={1}
              adjustsFontSizeToFit
              themeColor={st.value === sleepType ? 'text' : 'textSecondary'}>
              {t(`sleep.type.${st.key}`)}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      <TextInput
        style={[styles.input, styles.noteInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        placeholder={t('common.addNote')}
        placeholderTextColor={theme.textSecondary}
        value={note}
        onChangeText={onNoteChange}
        // Server limit (UpsertSleepRequest @Size(max = 2000)); longer notes would never sync.
        maxLength={2000}
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
