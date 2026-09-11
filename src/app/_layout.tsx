import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { I18nextProvider } from 'react-i18next';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { SessionProvider, useSession } from '@/auth/session-provider';
import i18n from '@/i18n';

SplashScreen.preventAutoHideAsync();

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <I18nextProvider i18n={i18n}>
        <SessionProvider>
          <RootStack />
        </SessionProvider>
      </I18nextProvider>
    </ThemeProvider>
  );
}

function RootStack() {
  const { session, isLoading } = useSession();

  if (isLoading) return null;

  return (
    <Stack>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
