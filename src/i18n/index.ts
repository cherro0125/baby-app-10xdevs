import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import enTranslation from './locales/en';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: enTranslation },
  },
  lng: getLocales()[0]?.languageTag.slice(0, 2) ?? 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
