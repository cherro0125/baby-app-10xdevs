import { useSession } from '@/auth/session-provider';
import type { SleepEdit } from '@/components/entry-edit';
import type { AppDatabase } from '@/db/schema';
import type { LocalSleep, SleepType } from '@/db/types';
import type { EntitySyncConfig } from '@/sync/entity-sync';
import { nowIso, uuid } from '@/sync/ids';
import { useEntitySync } from '@/sync/use-entity-sync';

// Floor, like the server's ChronoUnit.MINUTES.between, so the value doesn't change after sync
function computeDuration(startedAt: Date, endedAt: Date): number {
  return Math.floor((endedAt.getTime() - startedAt.getTime()) / 60_000);
}

const SLEEP_COLS = `
  id,
  user_id       AS userId,
  sleep_type    AS sleepType,
  started_at    AS startedAt,
  ended_at      AS endedAt,
  duration_minutes AS durationMinutes,
  note,
  created_at    AS createdAt,
  updated_at    AS updatedAt,
  synced
`;

async function loadSleeps(db: AppDatabase): Promise<LocalSleep[]> {
  return db.getAllAsync<LocalSleep>(
    `SELECT ${SLEEP_COLS} FROM sleeps ORDER BY started_at DESC LIMIT 200`,
  );
}

interface ServerSleep {
  id: string;
  userId: string;
  sleepType: SleepType;
  startedAt: string;
  endedAt: string;
  durationMinutes: number | null;
  note: string | null;
  createdAt: string;
}

const SLEEP_SYNC: EntitySyncConfig<ServerSleep> = {
  table: 'sleeps',
  endpoint: '/api/sleeps',
  tombstoneKey: 'sleepId',
  dataColumns: ['sleep_type', 'started_at', 'ended_at', 'duration_minutes', 'note'],
  fromServer: (row) => [row.sleepType, row.startedAt, row.endedAt, row.durationMinutes, row.note],
  uploadBody: (row) => ({
    startedAt: row.started_at,
    endedAt: row.ended_at,
    sleepType: row.sleep_type,
    note: row.note,
  }),
};

export interface UseSleepsResult {
  sleeps: LocalSleep[];
  activeSleep: LocalSleep | null;
  isLoading: boolean;
  /** Id of the active sleep at first DB load — for crash-recovery detection. */
  initialActiveId: string | null | undefined;
  start: (startedAt: Date) => Promise<void>;
  finalize: (id: string, endedAt: Date, sleepType: SleepType, note?: string | null) => Promise<void>;
  remove: (id: string) => Promise<void>;
  edit: (id: string, changes: SleepEdit) => Promise<void>;
}

export function useSleeps(hasPartner: boolean): UseSleepsResult {
  const { user } = useSession();
  const {
    rows: sleeps,
    isLoading,
    initialActiveId,
    dbRef,
    reload,
    remove: removeEntry,
    editPartner,
  } = useEntitySync(SLEEP_SYNC, hasPartner, loadSleeps);

  async function start(startedAt: Date): Promise<void> {
    const db = dbRef.current;
    if (!db || !user) return;
    try {
      const id = uuid();
      const now = nowIso();
      const userId = user.id.toString();
      await db.runAsync(
        'INSERT INTO sleeps (id, user_id, sleep_type, started_at, ended_at, duration_minutes, note, created_at, updated_at, synced) VALUES (?, ?, NULL, ?, NULL, NULL, NULL, ?, ?, 0)',
        [id, userId, startedAt.toISOString(), now, now],
      );
      await reload();
    } catch (e) {
      console.error('[useSleeps] start failed', e);
      throw e;
    }
  }

  async function finalize(
    id: string,
    endedAt: Date,
    sleepType: SleepType,
    note?: string | null,
  ): Promise<void> {
    const db = dbRef.current;
    if (!db || !user) return;
    try {
      const existing = await db.getFirstAsync<LocalSleep>(
        `SELECT ${SLEEP_COLS} FROM sleeps WHERE id = ? AND user_id = ?`,
        [id, user.id.toString()],
      );
      if (!existing) return;
      const durationMinutes = computeDuration(new Date(existing.startedAt), endedAt);
      const now = nowIso();
      await db.runAsync(
        'UPDATE sleeps SET ended_at = ?, sleep_type = ?, duration_minutes = ?, note = ?, updated_at = ?, synced = 0 WHERE id = ?',
        [endedAt.toISOString(), sleepType, durationMinutes, note ?? null, now, id],
      );
      await reload();
    } catch (e) {
      console.error('[useSleeps] finalize failed', e);
      throw e;
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await removeEntry(id);
    } catch (e) {
      console.error('[useSleeps] remove failed', e);
      throw e;
    }
  }

  async function edit(id: string, changes: SleepEdit): Promise<void> {
    const db = dbRef.current;
    // Throw rather than return: the edit sheet treats a resolved promise as saved and closes.
    if (!db || !user) throw new Error('edit before the sleeps database is ready');
    try {
      if (changes.endedAt <= changes.startedAt) {
        throw new Error('endedAt must be after startedAt');
      }
      const existing = await db.getFirstAsync<LocalSleep>(
        `SELECT ${SLEEP_COLS} FROM sleeps WHERE id = ?`,
        [id],
      );
      // E.g. a partner sleep dropped after a 404 while the sheet stayed open
      if (!existing) throw new Error(`Sleep ${id} no longer exists`);
      const startedAt = changes.startedAt.toISOString();
      const endedAt = changes.endedAt.toISOString();
      if (existing.userId !== user.id.toString()) {
        // Partner entry: full-replacement PUT on the server
        await editPartner(id, { startedAt, endedAt, sleepType: changes.sleepType, note: changes.note });
        return;
      }
      // Own entry: local-first flow, uploaded by the next sync
      const durationMinutes = computeDuration(changes.startedAt, changes.endedAt);
      const now = nowIso();
      await db.runAsync(
        'UPDATE sleeps SET started_at = ?, ended_at = ?, sleep_type = ?, duration_minutes = ?, note = ?, updated_at = ?, synced = 0 WHERE id = ?',
        [startedAt, endedAt, changes.sleepType, durationMinutes, changes.note, now, id],
      );
      await reload();
    } catch (e) {
      console.error('[useSleeps] edit failed', e);
      throw e;
    }
  }

  const myUserId = user?.id.toString();
  // A partner's row is never my running sleep
  const activeSleep = sleeps.find((s) => s.userId === myUserId && s.endedAt === null) ?? null;

  return { sleeps, activeSleep, isLoading, initialActiveId, start, finalize, remove, edit };
}
