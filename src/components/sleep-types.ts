import type { SleepType } from '@/db/types';
import type en from '@/i18n/locales/en';

type SleepTypeKey = keyof typeof en.sleep.type;

// Single source for sleep-type options; labels live under `sleep.type.<key>`
// and badge abbreviations under `sleep.typeShort.<key>`.
export const SLEEP_TYPE_KEYS = {
  NAP: 'nap',
  NIGHT: 'night',
  OTHER: 'other',
} as const satisfies Record<SleepType, SleepTypeKey>;

export const SLEEP_TYPES = (Object.keys(SLEEP_TYPE_KEYS) as SleepType[]).map((value) => ({
  value,
  key: SLEEP_TYPE_KEYS[value],
}));
