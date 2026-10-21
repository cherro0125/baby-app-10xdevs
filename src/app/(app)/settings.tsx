import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useSession } from '@/auth/session-provider';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { setAppLanguage } from '@/i18n/language';
import { SUPPORTED_LANGUAGES, type AppLanguage } from '@/i18n/types';

// Each language is named in itself, so these are deliberately not translated.
const LANGUAGE_NAMES: Record<AppLanguage, string> = {
  en: 'English',
  pl: 'Polski',
};

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { signOut } = useSession();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <ThemedText type="title">{t('settings.title')}</ThemedText>

        <ThemedView style={styles.section}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('settings.language')}
          </ThemedText>
          <ThemedView type="backgroundElement" accessibilityRole="radiogroup" style={styles.options}>
            {SUPPORTED_LANGUAGES.map((lng) => {
              const selected = i18n.resolvedLanguage === lng;
              return (
                <Pressable
                  key={lng}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setAppLanguage(lng)}>
                  <ThemedView
                    type={selected ? 'backgroundSelected' : 'backgroundElement'}
                    style={styles.option}>
                    <ThemedText type={selected ? 'smallBold' : 'small'}>{LANGUAGE_NAMES[lng]}</ThemedText>
                  </ThemedView>
                </Pressable>
              );
            })}
          </ThemedView>
        </ThemedView>

        <Pressable accessibilityRole="button" onPress={signOut} hitSlop={8} style={styles.signOut}>
          <ThemedView type="backgroundElement" style={styles.option}>
            <ThemedText type="small" themeColor="danger">
              {t('settings.signOut')}
            </ThemedText>
          </ThemedView>
        </Pressable>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  options: {
    borderRadius: Spacing.two,
    overflow: 'hidden',
  },
  // Pushed to the bottom so it is not tapped by accident next to the language options.
  signOut: {
    marginTop: 'auto',
  },
  option: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
});
