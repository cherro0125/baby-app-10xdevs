import type { MilkType } from '@/db/types';
import type en from '@/i18n/locales/en';

type MilkTypeKey = keyof typeof en.feeding.milkType;

// Single source for milk-type options; labels live under `feeding.milkType.<key>`
// and badge abbreviations under `feeding.milkTypeShort.<key>`.
export const MILK_TYPE_KEYS = {
  BREAST: 'breast',
  FORMULA: 'formula',
  PUMPED: 'pumped',
  OTHER: 'other',
} as const satisfies Record<MilkType, MilkTypeKey>;

export const MILK_TYPES = (Object.keys(MILK_TYPE_KEYS) as MilkType[]).map((value) => ({
  value,
  key: MILK_TYPE_KEYS[value],
}));
