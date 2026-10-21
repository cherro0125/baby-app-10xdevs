import type { TFunction } from 'i18next';
import { getLocales } from 'expo-localization';

// Keep the device's regional clock (e.g. en-GB → 24h) when the device speaks the app language.
export function clockLocale(lng: string, deviceTag: string | null | undefined): string {
  if (deviceTag && deviceTag.toLowerCase().split('-')[0] === lng) return deviceTag;
  return lng;
}

export function formatClockTime(date: Date | number, lng: string): string {
  const locale = clockLocale(lng, getLocales()[0]?.languageTag);
  return new Date(date).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

export function formatDurationSeconds(t: TFunction, seconds: number): string {
  const total = Math.round(seconds);
  return t('format.minSec', { m: Math.floor(total / 60), s: total % 60 });
}

export function formatDurationMinutes(t: TFunction, minutes: number): string {
  const total = Math.round(minutes);
  if (total < 60) return t('format.min', { m: total });
  return t('format.hMin', { h: Math.floor(total / 60), m: total % 60 });
}

export function formatMl(t: TFunction, amount: number): string {
  return t('format.ml', { amount });
}
