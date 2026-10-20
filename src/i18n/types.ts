import type en from './locales/en';

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

// Shape every locale must match: same keys as `en`, any string values.
export type TranslationShape = Widen<typeof en>;

export const SUPPORTED_LANGUAGES = ['en', 'pl'] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];
