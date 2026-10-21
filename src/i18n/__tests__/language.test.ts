import * as SecureStore from 'expo-secure-store';

import i18n from '@/i18n';
import {
  LANGUAGE_STORAGE_KEY,
  getSavedLanguage,
  resolveInitialLanguage,
  setAppLanguage,
} from '../language';

describe('resolveInitialLanguage', () => {
  it('prefers the saved language over the device language', () => {
    expect(resolveInitialLanguage('pl', 'en')).toBe('pl');
  });

  it('falls back to the device language when the saved value is invalid', () => {
    expect(resolveInitialLanguage('de', 'pl')).toBe('pl');
  });

  it('normalises a device tag such as pl-PL', () => {
    expect(resolveInitialLanguage(null, 'pl-PL')).toBe('pl');
  });

  it('falls back to English for unsupported device languages', () => {
    expect(resolveInitialLanguage(null, 'de')).toBe('en');
  });

  it('falls back to English when nothing is known', () => {
    expect(resolveInitialLanguage(null, null)).toBe('en');
    expect(resolveInitialLanguage(undefined, undefined)).toBe('en');
  });
});

describe('getSavedLanguage', () => {
  it('returns a supported saved language', () => {
    jest.mocked(SecureStore.getItem).mockReturnValueOnce('pl');
    expect(getSavedLanguage()).toBe('pl');
  });

  it('returns null for an unsupported saved value', () => {
    jest.mocked(SecureStore.getItem).mockReturnValueOnce('de');
    expect(getSavedLanguage()).toBeNull();
  });

  it('returns null when storage throws', () => {
    jest.mocked(SecureStore.getItem).mockImplementationOnce(() => {
      throw new Error('unavailable');
    });
    expect(getSavedLanguage()).toBeNull();
  });
});

describe('setAppLanguage', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('switches i18n and persists the choice', async () => {
    await setAppLanguage('pl');

    expect(i18n.language).toBe('pl');
    expect(i18n.t('signIn.button')).toBe('Zaloguj się przez Google');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(LANGUAGE_STORAGE_KEY, 'pl');
  });

  it('still switches when persisting fails', async () => {
    jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('disk full'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await setAppLanguage('pl');

    expect(i18n.language).toBe('pl');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not reject or persist when switching fails', async () => {
    // Works because Jest resolves i18next's CommonJS build, where language.ts's named
    // `changeLanguage` import reads from this instance; an ESM build would bypass the spy.
    const change = jest.spyOn(i18n, 'changeLanguage').mockRejectedValueOnce(new Error('boom'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(setAppLanguage('pl')).resolves.toBeUndefined();

    expect(i18n.language).toBe('en');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    change.mockRestore();
    warn.mockRestore();
  });
});
