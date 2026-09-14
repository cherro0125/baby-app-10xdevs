export interface LocalContraction {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  strength: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  synced: number;
}

export type MilkType = 'BREAST' | 'FORMULA' | 'PUMPED' | 'OTHER';

export interface LocalFeeding {
  id: string;
  userId: string;
  milkType: MilkType | null;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  amountMl: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  synced: number;
}

export interface SyncQueueItem {
  id: string;
  operation: 'CREATE' | 'FINALIZE' | 'DELETE';
  payload: string;
  createdAt: string;
  attempts: number;
}
