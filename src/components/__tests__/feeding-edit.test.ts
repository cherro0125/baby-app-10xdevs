import { buildEditTimes, parseAmountMl } from '@/components/feeding-edit';

describe('parseAmountMl', () => {
  it.each([
    ['', null],
    ['  ', null],
    ['120', 120],
    [' 90 ', 90],
    ['0', 'invalid'],
    ['12.5', 'invalid'],
    ['abc', 'invalid'],
    ['10000', 10000],
    ['10001', 'invalid'],
    ['9999999999', 'invalid'],
  ])('parses %j as %j', (text, expected) => {
    expect(parseAmountMl(text)).toBe(expected);
  });
});

describe('buildEditTimes', () => {
  // Local-time dates, matching how the edit sheet applies hours and minutes.
  const at = (day: number, h: number, m: number) => new Date(2026, 9, day, h, m, 0, 0);

  it('applies new hours and minutes on the original day', () => {
    const feeding = { startedAt: at(21, 10, 0).toISOString(), endedAt: at(21, 10, 20).toISOString() };

    expect(buildEditTimes(feeding, { h: 9, m: 45 }, { h: 10, m: 15 })).toEqual({
      startedAt: at(21, 9, 45),
      endedAt: at(21, 10, 15),
    });
  });

  it('moves the end to the next day when it crosses midnight', () => {
    const feeding = { startedAt: at(21, 23, 30).toISOString(), endedAt: at(21, 23, 50).toISOString() };

    expect(buildEditTimes(feeding, { h: 23, m: 30 }, { h: 0, m: 10 })).toEqual({
      startedAt: at(21, 23, 30),
      endedAt: at(22, 0, 10),
    });
  });

  it('keeps an end corrected to before midnight on the start day', () => {
    const feeding = { startedAt: at(21, 23, 40).toISOString(), endedAt: at(22, 0, 15).toISOString() };

    expect(buildEditTimes(feeding, { h: 23, m: 40 }, { h: 23, m: 58 })).toEqual({
      startedAt: at(21, 23, 40),
      endedAt: at(21, 23, 58),
    });
  });

  it('moves a start corrected to after midnight to the next day', () => {
    const feeding = { startedAt: at(21, 23, 40).toISOString(), endedAt: at(22, 0, 15).toISOString() };

    expect(buildEditTimes(feeding, { h: 0, m: 5 }, { h: 0, m: 15 })).toEqual({
      startedAt: at(22, 0, 5),
      endedAt: at(22, 0, 15),
    });
  });

  it('rejects a same-day end moved before the start instead of adding a day', () => {
    const feeding = { startedAt: at(21, 10, 0).toISOString(), endedAt: at(21, 10, 30).toISOString() };

    expect(buildEditTimes(feeding, { h: 10, m: 0 }, { h: 9, m: 50 })).toBe('endBeforeStart');
  });

  it('rejects a feeding of 24 hours or more', () => {
    const feeding = { startedAt: at(21, 20, 0).toISOString(), endedAt: at(22, 7, 0).toISOString() };

    expect(buildEditTimes(feeding, { h: 9, m: 0 }, { h: 10, m: 0 })).toBe('tooLong');
  });

  it('rejects an end equal to the start', () => {
    const feeding = { startedAt: at(21, 10, 0).toISOString(), endedAt: at(21, 10, 20).toISOString() };

    expect(buildEditTimes(feeding, { h: 10, m: 0 }, { h: 10, m: 0 })).toBe('endBeforeStart');
  });
});
