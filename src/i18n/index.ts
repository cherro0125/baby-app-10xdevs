import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import enTranslation from './locales/en';
import plTranslation from './locales/pl';
import { getSavedLanguage, resolveInitialLanguage } from './language';
import { SUPPORTED_LANGUAGES } from './types';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: enTranslation },
    pl: { translation: plTranslation },
  },
  lng: resolveInitialLanguage(getSavedLanguage(), getLocales()[0]?.languageCode),
  supportedLngs: SUPPORTED_LANGUAGES,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
