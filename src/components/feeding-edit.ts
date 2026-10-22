import type { MilkType } from '@/db/types';

/** Full replacement of a completed feeding's editable fields. */
export interface FeedingEdit {
  startedAt: Date;
  endedAt: Date;
  milkType: MilkType;
  amountMl: number | null; // null = no amount
  note: string | null; // null = no note
}

/** Parses the amount input: empty → null, positive whole number → number, anything else → 'invalid'. */
export function parseAmountMl(text: string): number | null | 'invalid' {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return 'invalid';
  const amount = parseInt(trimmed, 10);
  return amount > 0 ? amount : 'invalid';
}

interface ClockTime {
  h: number;
  m: number;
}

/**
 * Applies edited hours/minutes to the feeding's original days.
 * Returns 'endBeforeStart' when the end is not after the start.
 */
export function buildEditTimes(
  feeding: { startedAt: string; endedAt: string },
  start: ClockTime,
  end: ClockTime,
): { startedAt: Date; endedAt: Date } | 'endBeforeStart' {
  const startedAt = new Date(feeding.startedAt);
  startedAt.setHours(start.h, start.m, 0, 0);
  const endedAt = new Date(feeding.endedAt);
  endedAt.setHours(end.h, end.m, 0, 0);
  // Midnight crossing: if editing hours pushed end to before start, advance by one day.
  // Assumes feedings are < 24h.
  if (endedAt < startedAt) {
    endedAt.setDate(endedAt.getDate() + 1);
  }
  if (endedAt <= startedAt) return 'endBeforeStart';
  return { startedAt, endedAt };
}
