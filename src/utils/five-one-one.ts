import type { LocalContraction } from '@/db/types';

export type FiveOneOneStatus = 'idle' | 'tracking' | 'alert';

export function computeFiveOneOne(contractions: LocalContraction[]): { status: FiveOneOneStatus } {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();

  const today = contractions.filter((c) => new Date(c.startedAt).getTime() >= todayMs);

  if (today.length === 0) return { status: 'idle' };

  // 5-1-1: ≥3 finished contractions lasting ≥60 s, consecutive start-to-start gaps ≤5 min,
  // and the window from first to last start spans ≥1 hour.
  const qualifying = today
    .filter((c) => c.endedAt !== null && (c.durationSeconds ?? 0) >= 60)
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

  if (qualifying.length >= 3) {
    let runStart = 0;
    for (let i = 0; i < qualifying.length; i++) {
      if (i > 0) {
        const gapMs =
          new Date(qualifying[i].startedAt).getTime() -
          new Date(qualifying[i - 1].startedAt).getTime();
        if (gapMs > 300_000) {
          runStart = i;
        }
      }
      const runLen = i - runStart + 1;
      if (runLen >= 3) {
        const spanMs =
          new Date(qualifying[i].startedAt).getTime() -
          new Date(qualifying[runStart].startedAt).getTime();
        if (spanMs >= 3_600_000) {
          return { status: 'alert' };
        }
      }
    }
  }

  return { status: 'tracking' };
}
