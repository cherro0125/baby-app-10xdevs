import type { MilkType } from '@/db/types';

type MilkTypeKey = 'breast' | 'formula' | 'pumped' | 'other';

// Single source for milk-type options; labels live under `feeding.milkType.<key>`
// and badge abbreviations under `feeding.milkTypeShort.<key>`.
export const MILK_TYPES: { value: MilkType; key: MilkTypeKey }[] = [
  { value: 'BREAST', key: 'breast' },
  { value: 'FORMULA', key: 'formula' },
  { value: 'PUMPED', key: 'pumped' },
  { value: 'OTHER', key: 'other' },
];

export const MILK_TYPE_KEYS: Record<MilkType, MilkTypeKey> = {
  BREAST: 'breast',
  FORMULA: 'formula',
  PUMPED: 'pumped',
  OTHER: 'other',
};
