import { useSession } from '@/auth/session-provider';
import type { ContractionEdit } from '@/components/entry-edit';
import type { AppDatabase } from '@/db/schema';
import type { LocalContraction } from '@/db/types';
import type { EntitySyncConfig } from '@/sync/entity-sync';
import { nowIso, uuid } from '@/sync/ids';
import { useEntitySync } from '@/sync/use-entity-sync';

// Floor, like the server's ChronoUnit.SECONDS.between, so the value doesn't change after sync
function computeDuration(startedAt: Date, endedAt: Date): number {
  return Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);
}

const CONTRACTION_COLS = `
  id,
  user_id AS userId,
  started_at AS startedAt,
  ended_at AS endedAt,
  duration_seconds AS durationSeconds,
  strength,
  note,
  created_at AS createdAt,
  updated_at AS updatedAt,
  synced
`;

async function loadContractions(db: AppDatabase): Promise<LocalContraction[]> {
  return db.getAllAsync<LocalContraction>(
    `SELECT ${CONTRACTION_COLS} FROM contractions ORDER BY started_at DESC LIMIT 200`,
  );
}

interface ServerContraction {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  strength: number | null;
  note: string | null;
  createdAt: string;
}

const CONTRACTION_SYNC: EntitySyncConfig<ServerContraction> = {
  table: 'contractions',
  endpoint: '/api/contractions',
  tombstoneKey: 'contractionId',
  dataColumns: ['started_at', 'ended_at', 'duration_seconds', 'strength', 'note'],
  fromServer: (row) => [row.startedAt, row.endedAt, row.durationSeconds, row.strength, row.note],
  uploadBody: (row) => ({
    startedAt: row.started_at,
    endedAt: row.ended_at,
    strength: row.strength,
    note: row.note,
  }),
};

export interface UseContractionsResult {
  contractions: LocalContraction[];
  activeContraction: LocalContraction | null;
  isLoading: boolean;
  /** Id of the active contraction present when the DB first loaded — for crash-recovery detection. */
  initialActiveId: string | null | undefined;
  start: (startedAt: Date) => Promise<void>;
  finalize: (id: string, endedAt: Date, strength?: number | null, note?: string | null) => Promise<void>;
  remove: (id: string) => Promise<void>;
  edit: (id: string, changes: ContractionEdit) => Promise<void>;
}

export function useContractions(hasPartner: boolean): UseContractionsResult {
  const { user } = useSession();
  const {
    rows: contractions,
    isLoading,
    initialActiveId,
    dbRef,
    reload,
    remove: removeEntry,
    editPartner,
  } = useEntitySync(CONTRACTION_SYNC, hasPartner, loadContractions);

  async function start(startedAt: Date): Promise<void> {
    const db = dbRef.current;
    if (!db || !user) return;
    try {
      const id = uuid();
      const now = nowIso();
      const userId = user.id.toString();
      await db.runAsync(
        'INSERT INTO contractions (id, user_id, started_at, ended_at, duration_seconds, strength, note, created_at, updated_at, synced) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, 0)',
        [id, userId, startedAt.toISOString(), now, now],
      );
      await reload();
    } catch (e) {
      console.error('[useContractions] start failed', e);
      throw e;
    }
  }

  async function finalize(
    id: string,
    endedAt: Date,
    strength?: number | null,
    note?: string | null,
  ): Promise<void> {
    const db = dbRef.current;
    if (!db || !user) return;
    try {
      const existing = await db.getFirstAsync<LocalContraction>(
        `SELECT ${CONTRACTION_COLS} FROM contractions WHERE id = ? AND user_id = ?`,
        [id, user.id.toString()],
      );
      if (!existing) return;
      const durationSeconds = computeDuration(new Date(existing.startedAt), endedAt);
      const now = nowIso();
      await db.runAsync(
        'UPDATE contractions SET ended_at = ?, duration_seconds = ?, strength = ?, note = ?, updated_at = ?, synced = 0 WHERE id = ?',
        [endedAt.toISOString(), durationSeconds, strength ?? null, note ?? null, now, id],
      );
      await reload();
    } catch (e) {
      console.error('[useContractions] finalize failed', e);
      throw e;
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await removeEntry(id);
    } catch (e) {
      console.error('[useContractions] remove failed', e);
      throw e;
    }
  }

  async function edit(id: string, changes: ContractionEdit): Promise<void> {
    const db = dbRef.current;
    // Throw rather than return: the edit sheet treats a resolved promise as saved and closes.
    if (!db || !user) throw new Error('edit before the contractions database is ready');
    try {
      if (changes.endedAt <= changes.startedAt) {
        throw new Error('endedAt must be after startedAt');
      }
      const existing = await db.getFirstAsync<LocalContraction>(
        `SELECT ${CONTRACTION_COLS} FROM contractions WHERE id = ?`,
        [id],
      );
      // E.g. a partner contraction dropped after a 404 while the sheet stayed open
      if (!existing) throw new Error(`Contraction ${id} no longer exists`);
      const startedAt = changes.startedAt.toISOString();
      const endedAt = changes.endedAt.toISOString();
      if (existing.userId !== user.id.toString()) {
        // Partner entry: full-replacement PUT on the server
        await editPartner(id, { startedAt, endedAt, strength: changes.strength, note: changes.note });
        return;
      }
      // Own entry: local-first flow, uploaded by the next sync
      const durationSeconds = computeDuration(changes.startedAt, changes.endedAt);
      const now = nowIso();
      await db.runAsync(
        'UPDATE contractions SET started_at = ?, ended_at = ?, duration_seconds = ?, strength = ?, note = ?, updated_at = ?, synced = 0 WHERE id = ?',
        [startedAt, endedAt, durationSeconds, changes.strength, changes.note, now, id],
      );
      await reload();
    } catch (e) {
      console.error('[useContractions] edit failed', e);
      throw e;
    }
  }

  const myUserId = user?.id.toString();
  // A partner's row is never my running contraction
  const activeContraction =
    contractions.find((c) => c.userId === myUserId && c.endedAt === null) ?? null;

  return { contractions, activeContraction, isLoading, initialActiveId, start, finalize, remove, edit };
}
