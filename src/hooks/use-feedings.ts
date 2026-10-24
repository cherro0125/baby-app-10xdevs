import { useSession } from '@/auth/session-provider';
import type { FeedingEdit } from '@/components/feeding-edit';
import type { AppDatabase } from '@/db/schema';
import type { LocalFeeding, MilkType } from '@/db/types';
import type { EntitySyncConfig } from '@/sync/entity-sync';
import { useEntitySync } from '@/sync/use-entity-sync';

function nowIso(): string {
  return new Date().toISOString();
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const FEEDING_COLS = `
  id,
  user_id       AS userId,
  milk_type     AS milkType,
  started_at    AS startedAt,
  ended_at      AS endedAt,
  duration_minutes AS durationMinutes,
  amount_ml     AS amountMl,
  note,
  created_at    AS createdAt,
  updated_at    AS updatedAt,
  synced
`;

async function loadFeedings(db: AppDatabase): Promise<LocalFeeding[]> {
  return db.getAllAsync<LocalFeeding>(
    `SELECT ${FEEDING_COLS} FROM feedings ORDER BY started_at DESC LIMIT 200`,
  );
}

interface ServerFeeding {
  id: string;
  userId: string;
  milkType: MilkType;
  startedAt: string;
  endedAt: string;
  durationMinutes: number | null;
  amountMl: number | null;
  note: string | null;
  createdAt: string;
}

const FEEDING_SYNC: EntitySyncConfig<ServerFeeding> = {
  table: 'feedings',
  endpoint: '/api/feedings',
  tombstoneKey: 'feedingId',
  dataColumns: ['milk_type', 'started_at', 'ended_at', 'duration_minutes', 'amount_ml', 'note'],
  fromServer: (row) => [row.milkType, row.startedAt, row.endedAt, row.durationMinutes, row.amountMl, row.note],
  uploadBody: (row) => ({
    startedAt: row.started_at,
    endedAt: row.ended_at,
    milkType: row.milk_type,
    amountMl: row.amount_ml,
    note: row.note,
  }),
};

export interface UseFeedingsResult {
  feedings: LocalFeeding[];
  activeFeeding: LocalFeeding | null;
  isLoading: boolean;
  /** Id of the active feeding at first DB load — for crash-recovery detection. */
  initialActiveId: string | null | undefined;
  start: (startedAt: Date) => Promise<void>;
  finalize: (
    id: string,
    endedAt: Date,
    milkType: MilkType,
    amountMl?: number | null,
    note?: string | null,
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
  edit: (id: string, changes: FeedingEdit) => Promise<void>;
}

export function useFeedings(hasPartner: boolean): UseFeedingsResult {
  const { user } = useSession();
  const {
    rows: feedings,
    isLoading,
    initialActiveId,
    dbRef,
    reload,
    remove: removeEntry,
    editPartner,
  } = useEntitySync(FEEDING_SYNC, hasPartner, loadFeedings);

  async function start(startedAt: Date): Promise<void> {
    const db = dbRef.current;
    if (!db || !user) return;
    try {
      const id = uuid();
      const now = nowIso();
      const userId = user.id.toString();
      await db.runAsync(
        'INSERT INTO feedings (id, user_id, milk_type, started_at, ended_at, duration_minutes, amount_ml, note, created_at, updated_at, synced) VALUES (?, ?, NULL, ?, NULL, NULL, NULL, NULL, ?, ?, 0)',
        [id, userId, startedAt.toISOString(), now, now],
      );
      await reload();
    } catch (e) {
      console.error('[useFeedings] start failed', e);
      throw e;
    }
  }

  async function finalize(
    id: string,
    endedAt: Date,
    milkType: MilkType,
    amountMl?: number | null,
    note?: string | null,
  ): Promise<void> {
    const db = dbRef.current;
    if (!db || !user) return;
    try {
      const existing = await db.getFirstAsync<LocalFeeding>(
        `SELECT ${FEEDING_COLS} FROM feedings WHERE id = ? AND user_id = ?`,
        [id, user.id.toString()],
      );
      if (!existing) return;
      const endedAtIso = endedAt.toISOString();
      // Floor, like the server's ChronoUnit.MINUTES.between, so the value doesn't change after sync
      const durationMinutes = Math.floor(
        (endedAt.getTime() - new Date(existing.startedAt).getTime()) / 60_000,
      );
      const now = nowIso();
      await db.runAsync(
        'UPDATE feedings SET ended_at = ?, milk_type = ?, duration_minutes = ?, amount_ml = ?, note = ?, updated_at = ?, synced = 0 WHERE id = ?',
        [endedAtIso, milkType, durationMinutes, amountMl ?? null, note ?? null, now, id],
      );
      await reload();
    } catch (e) {
      console.error('[useFeedings] finalize failed', e);
      throw e;
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await removeEntry(id);
    } catch (e) {
      console.error('[useFeedings] remove failed', e);
      throw e;
    }
  }

  async function edit(id: string, changes: FeedingEdit): Promise<void> {
    const db = dbRef.current;
    // Throw rather than return: the edit sheet treats a resolved promise as saved and closes.
    if (!db || !user) throw new Error('edit before the feedings database is ready');
    try {
      if (changes.endedAt <= changes.startedAt) {
        throw new Error('endedAt must be after startedAt');
      }
      const existing = await db.getFirstAsync<LocalFeeding>(
        `SELECT ${FEEDING_COLS} FROM feedings WHERE id = ?`,
        [id],
      );
      // E.g. a partner feeding dropped after a 404 while the sheet stayed open
      if (!existing) throw new Error(`Feeding ${id} no longer exists`);
      const startedAt = changes.startedAt.toISOString();
      const endedAt = changes.endedAt.toISOString();
      const now = nowIso();
      if (existing.userId !== user.id.toString()) {
        // Partner entry: full-replacement PUT on the server
        await editPartner(id, {
          startedAt,
          endedAt,
          milkType: changes.milkType,
          amountMl: changes.amountMl,
          note: changes.note,
        });
        return;
      }
      // Own entry: local-first flow, uploaded by the next sync
      // Floor, like the server's ChronoUnit.MINUTES.between, so the value doesn't change after sync
      const durationMinutes = Math.floor(
        (changes.endedAt.getTime() - changes.startedAt.getTime()) / 60_000,
      );
      await db.runAsync(
        'UPDATE feedings SET started_at = ?, ended_at = ?, milk_type = ?, duration_minutes = ?, amount_ml = ?, note = ?, updated_at = ?, synced = 0 WHERE id = ?',
        [startedAt, endedAt, changes.milkType, durationMinutes, changes.amountMl, changes.note, now, id],
      );
      await reload();
    } catch (e) {
      console.error('[useFeedings] edit failed', e);
      throw e;
    }
  }

  const myUserId = user?.id.toString();
  const activeFeeding = feedings.find((f) => f.userId === myUserId && f.endedAt === null) ?? null;

  return { feedings, activeFeeding, isLoading, initialActiveId, start, finalize, remove, edit };
}
