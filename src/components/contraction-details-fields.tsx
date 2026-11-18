import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const STRENGTH_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface ContractionDetailsFieldsProps {
  strength: number | null;
  onStrengthChange: (strength: number | null) => void;
  note: string;
  onNoteChange: (note: string) => void;
}

/** Strength (tap again to clear) and note inputs shared by the timer and the edit sheet. */
export function ContractionDetailsFields({
  strength,
  onStrengthChange,
  note,
  onNoteChange,
}: ContractionDetailsFieldsProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <>
      <View style={styles.strengthSection}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('contractions.strength')}
        </ThemedText>
        <View style={styles.pips}>
          {STRENGTH_LEVELS.map((n) => (
            <Pressable
              key={n}
              onPress={() => onStrengthChange(n === strength ? null : n)}
              style={[
                styles.pip,
                { backgroundColor: n === strength ? theme.text : theme.backgroundElement },
              ]}>
              <ThemedText
                type="small"
                style={{ color: n === strength ? theme.background : theme.text }}>
                {n}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </View>

      <TextInput
        style={[styles.noteInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        placeholder={t('common.addNote')}
        placeholderTextColor={theme.textSecondary}
        value={note}
        onChangeText={onNoteChange}
        // Server limit (UpsertContractionRequest @Size(max = 2000)); longer notes would never sync.
        maxLength={2000}
        multiline
      />
    </>
  );
}

const styles = StyleSheet.create({
  strengthSection: {
    alignSelf: 'stretch',
    gap: Spacing.two,
  },
  pips: {
    flexDirection: 'row',
    gap: Spacing.one,
    flexWrap: 'wrap',
  },
  pip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteInput: {
    alignSelf: 'stretch',
    borderRadius: Spacing.two,
    padding: Spacing.two,
    minHeight: 64,
    fontSize: 14,
  },
});
