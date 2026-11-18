import type { MilkType, SleepType } from '@/db/types';

/** Full replacement of a completed feeding's editable fields. */
export interface FeedingEdit {
  startedAt: Date;
  endedAt: Date;
  milkType: MilkType;
  amountMl: number | null; // null = no amount
  note: string | null; // null = no note
}

/** Full replacement of a completed contraction's editable fields. */
export interface ContractionEdit {
  startedAt: Date;
  endedAt: Date;
  strength: number | null; // null = no strength
  note: string | null; // null = no note
}

/** Full replacement of a completed sleep's editable fields. */
export interface SleepEdit {
  startedAt: Date;
  endedAt: Date;
  sleepType: SleepType;
  note: string | null; // null = no note
}

// Far above any real feeding; also keeps the value inside the backend's Int amountMl.
const MAX_AMOUNT_ML = 10_000;

/** Parses the amount input: empty → null, whole number 1–10,000 → number, anything else → 'invalid'. */
export function parseAmountMl(text: string): number | null | 'invalid' {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return 'invalid';
  const amount = parseInt(trimmed, 10);
  return amount > 0 && amount <= MAX_AMOUNT_ML ? amount : 'invalid';
}

interface ClockTime {
  h: number;
  m: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * The given clock time on whichever day keeps it closest (within 12 h) to the original timestamp.
 * An unchanged hour and minute return the original instant, so untouched seconds are kept.
 */
function nearestTo(original: Date, time: ClockTime): Date {
  if (time.h === original.getHours() && time.m === original.getMinutes()) return new Date(original);
  const result = new Date(original);
  result.setHours(time.h, time.m, 0, 0);
  const diff = result.getTime() - original.getTime();
  if (diff > 12 * HOUR_MS) result.setDate(result.getDate() - 1);
  else if (diff < -12 * HOUR_MS) result.setDate(result.getDate() + 1);
  return result;
}

/**
 * Applies edited hours/minutes to a completed entry, each time staying on the day nearest its original
 * value, so corrections around midnight move by minutes, not by a day.
 * Returns 'endBeforeStart' when the end is not after the start, 'tooLong' for 24 h or more.
 */
export function buildEditTimes(
  entry: { startedAt: string; endedAt: string },
  start: ClockTime,
  end: ClockTime,
): { startedAt: Date; endedAt: Date } | 'endBeforeStart' | 'tooLong' {
  const startedAt = nearestTo(new Date(entry.startedAt), start);
  const endedAt = nearestTo(new Date(entry.endedAt), end);
  if (endedAt <= startedAt) return 'endBeforeStart';
  if (endedAt.getTime() - startedAt.getTime() >= DAY_MS) return 'tooLong';
  return { startedAt, endedAt };
}
