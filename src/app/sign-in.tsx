import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSession } from '@/auth/session-provider';
import { Spacing } from '@/constants/theme';

export default function SignInScreen() {
  const { t } = useTranslation();
  const { signIn } = useSession();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    try {
      setIsSigningIn(true);
      setError(null);
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();
      if (result.type === 'cancelled') return;
      const idToken = result.data.idToken;
      if (!idToken) throw new Error('No ID token received');
      await signIn(idToken);
    } catch (err) {
      setError(
        err instanceof TypeError ? t('signIn.error.network') : t('signIn.error.generic'),
      );
    } finally {
      setIsSigningIn(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.centered}>
        {t('signIn.title')}
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.centered}>
        {t('signIn.tagline')}
      </ThemedText>

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={handleSignIn}
        disabled={isSigningIn}>
        <ThemedText type="small" style={styles.buttonText}>
          {isSigningIn ? '…' : t('signIn.button')}
        </ThemedText>
      </Pressable>

      {error ? (
        <ThemedText themeColor="textSecondary" style={styles.centered}>
          {error}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  centered: {
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#ffffff',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#dadce0',
    marginTop: Spacing.three,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#3c4043',
  },
});
