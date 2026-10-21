import { changeLanguage } from 'i18next';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { SUPPORTED_LANGUAGES, type AppLanguage } from './types';

export const LANGUAGE_STORAGE_KEY = 'app_language';

function toSupported(value: string | null | undefined): AppLanguage | null {
  const code = value?.toLowerCase().split('-')[0];
  return SUPPORTED_LANGUAGES.find((lng) => lng === code) ?? null;
}

// Saved choice beats the device language; anything unsupported falls back to English.
export function resolveInitialLanguage(
  saved: string | null | undefined,
  deviceLanguageCode: string | null | undefined,
): AppLanguage {
  return toSupported(saved) ?? toSupported(deviceLanguageCode) ?? 'en';
}

// Synchronous so i18n can start in the right language on the first frame.
// expo-secure-store has no web implementation, so web never has a saved choice.
export function getSavedLanguage(): AppLanguage | null {
  if (Platform.OS === 'web') return null;
  try {
    return toSupported(SecureStore.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export async function setAppLanguage(lng: AppLanguage): Promise<void> {
  await changeLanguage(lng);
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, lng);
  } catch (e) {
    console.warn('[i18n] failed to persist language', e);
  }
}
