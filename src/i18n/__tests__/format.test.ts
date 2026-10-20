import i18n from '@/i18n';
import {
  formatClockTime,
  formatDurationMinutes,
  formatDurationSeconds,
  formatMl,
} from '../format';

const afternoon = new Date(2026, 0, 1, 14, 5);

describe('formatClockTime', () => {
  it('uses 24-hour time for Polish', () => {
    expect(formatClockTime(afternoon, 'pl')).toBe('14:05');
  });

  it('uses the English clock for English', () => {
    expect(formatClockTime(afternoon, 'en')).toMatch(/02:05\s?PM/);
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
