import type { TFunction } from 'i18next';

export function formatClockTime(date: Date | number, lng: string): string {
  return new Date(date).toLocaleTimeString(lng, { hour: '2-digit', minute: '2-digit' });
}

export function formatDurationSeconds(t: TFunction, seconds: number): string {
  return t('format.minSec', { m: Math.floor(seconds / 60), s: seconds % 60 });
}

export function formatDurationMinutes(t: TFunction, minutes: number): string {
  if (minutes < 60) return t('format.min', { m: minutes });
  return t('format.hMin', { h: Math.floor(minutes / 60), m: minutes % 60 });
}

export function formatMl(t: TFunction, amount: number): string {
  return t('format.ml', { amount });
}
