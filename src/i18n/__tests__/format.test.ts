import { getLocales } from 'expo-localization';

import i18n from '@/i18n';
import {
  clockLocale,
  formatClockTime,
  formatDurationMinutes,
  formatDurationSeconds,
  formatMl,
} from '../format';

const afternoon = new Date(2026, 0, 1, 14, 5);

describe('clockLocale', () => {
  it('keeps the device region when it speaks the app language', () => {
    expect(clockLocale('en', 'en-GB')).toBe('en-GB');
  });

  it('uses the app language when the device speaks another one', () => {
    expect(clockLocale('pl', 'en-GB')).toBe('pl');
    expect(clockLocale('en', 'pl-PL')).toBe('en');
  });

  it('uses the app language when the device tag is unknown', () => {
    expect(clockLocale('en', undefined)).toBe('en');
  });
});

describe('formatClockTime', () => {
  it('uses 24-hour time for Polish', () => {
    expect(formatClockTime(afternoon, 'pl')).toBe('14:05');
  });

  it('uses the US clock for English on a US device', () => {
    expect(formatClockTime(afternoon, 'en')).toMatch(/02:05\s?PM/);
  });

  it('keeps 24-hour time for English on a UK device', () => {
    jest.mocked(getLocales).mockReturnValueOnce([
      { languageCode: 'en', languageTag: 'en-GB' } as ReturnType<typeof getLocales>[number],
    ]);
    expect(formatClockTime(afternoon, 'en')).toBe('14:05');
  });
});

describe.each([
  ['en', '1m 5s', '45m', '2h 5m', '120 ml'],
  ['pl', '1 min 5 s', '45 min', '2 godz. 5 min', '120 ml'],
])('duration helpers (%s)', (lng, minSec, min, hMin, ml) => {
  const t = i18n.getFixedT(lng);

  it('formats seconds as minutes and seconds', () => {
    expect(formatDurationSeconds(t, 65)).toBe(minSec);
  });

  it('rounds fractional input', () => {
    expect(formatDurationSeconds(t, 65.4)).toBe(minSec);
    expect(formatDurationMinutes(t, 44.6)).toBe(min);
  });

  it('formats short durations in minutes', () => {
    expect(formatDurationMinutes(t, 45)).toBe(min);
  });

  it('formats long durations in hours and minutes', () => {
    expect(formatDurationMinutes(t, 125)).toBe(hMin);
  });

  it('formats millilitres', () => {
    expect(formatMl(t, 120)).toBe(ml);
  });
});
