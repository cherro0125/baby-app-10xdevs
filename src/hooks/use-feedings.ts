import { useEffect, useRef, useState } from 'react';

import { createApiClient } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import type { FeedingEdit } from '@/components/feeding-edit';
import type { AppDatabase } from '@/db/schema';
import { openDatabase, runMigrations } from '@/db/schema';
import type { LocalFeeding, MilkType } from '@/db/types';

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

// Matches the backend's findTop200…OrderByStartedAtDesc for GET /api/feedings/shared.
const SHARED_PAGE_SIZE = 200;

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

async function syncWithBackend(
  db: AppDatabase,
  userId: string,
  token: string,
  onUnauth: () => void,
): Promise<void> {
  try {
    const api = createApiClient(() => token, onUnauth);

    // Deletions: send queued own-feeding deletions first, so the download no longer returns them.
    // Only this user's: another account's token would get a 404 and drop the tombstone.
    // Tombstones written before userId was recorded are sent by whoever syncs first.
    const tombstones = await db.getAllAsync<{ id: string; feedingId: string }>(
      `SELECT id, json_extract(payload, '$.feedingId') AS feedingId FROM sync_queue
       WHERE operation = 'DELETE' AND json_extract(payload, '$.feedingId') IS NOT NULL
         AND COALESCE(json_extract(payload, '$.userId'), ?) = ?`,
      [userId, userId],
    );
    for (const tombstone of tombstones) {
      try {
        const delRes = await api.request(`/api/feedings/${tombstone.feedingId}`, { method: 'DELETE' });
        // 404: never uploaded or already gone — the deletion is done either way
        if (delRes.ok || delRes.status === 404) {
          await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [tombstone.id]);
        } else {
          await db.runAsync('UPDATE sync_queue SET attempts = attempts + 1 WHERE id = ?', [tombstone.id]);
        }
      } catch {
        // best-effort: keep the tombstone for next attempt
      }
    }

    // Download: upsert shared feed
    const res = await api.request('/api/feedings/shared');
    if (res.ok) {
      const serverRows = (await res.json()) as ServerFeeding[];
      const now = nowIso();
      for (const row of serverRows) {
        if (row.userId !== userId) {
          // Partner row: always take server version
          await db.runAsync(
            'INSERT OR REPLACE INTO feedings (id, user_id, milk_type, started_at, ended_at, duration_minutes, amount_ml, note, created_at, updated_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
            [row.id, row.userId, row.milkType, row.startedAt, row.endedAt, row.durationMinutes, row.amountMl, row.note, row.createdAt, now],
          );
        } else {
          // Own row: server wins unless a local edit is still waiting for upload or the
          // feeding was deleted locally. One statement, so a concurrent edit or delete can't be overwritten.
          await db.runAsync(
            `INSERT INTO feedings (id, user_id, milk_type, started_at, ended_at, duration_minutes, amount_ml, note, created_at, updated_at, synced)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1
             WHERE NOT EXISTS (
               SELECT 1 FROM sync_queue
               WHERE operation = 'DELETE' AND json_extract(payload, '$.feedingId') = ?
             )
             ON CONFLICT(id) DO UPDATE SET
               milk_type = excluded.milk_type, started_at = excluded.started_at, ended_at = excluded.ended_at,
               duration_minutes = excluded.duration_minutes, amount_ml = excluded.amount_ml, note = excluded.note,
               created_at = excluded.created_at, updated_at = excluded.updated_at, synced = 1
             WHERE feedings.synced = 1`,
            [row.id, row.userId, row.milkType, row.startedAt, row.endedAt, row.durationMinutes, row.amountMl, row.note, row.createdAt, now, row.id],
          );
        }
      }
      // Purge stale partner rows not in server response
      const partnerIds = serverRows.filter((r) => r.userId !== userId).map((r) => r.id);
      if (partnerIds.length > 0) {
        const placeholders = partnerIds.map(() => '?').join(',');
        await db.runAsync(
          `DELETE FROM feedings WHERE user_id != ? AND id NOT IN (${placeholders})`,
          [userId, ...partnerIds],
        );
      } else {
        await db.runAsync('DELETE FROM feedings WHERE user_id != ?', [userId]);
      }
      // Purge own rows deleted on the server (e.g. by the partner): a synced row missing from the
      // response is gone there. Unsynced rows are kept for upload. A full page only covers its
      // startedAt window, so older rows are left alone. julianday() because server and local
      // timestamps differ in fractional-second digits.
      const ownIds = serverRows.filter((r) => r.userId === userId).map((r) => r.id);
      // The server sorts by startedAt DESC, so the last row is the oldest.
      const windowStart =
        serverRows.length >= SHARED_PAGE_SIZE ? serverRows[serverRows.length - 1].startedAt : null;
      const notInOwn = ownIds.length > 0 ? `AND id NOT IN (${ownIds.map(() => '?').join(',')})` : '';
      await db.runAsync(
        `DELETE FROM feedings WHERE user_id = ? AND synced = 1 ${notInOwn}
         AND (? IS NULL OR julianday(started_at) >= julianday(?))`,
        [userId, ...ownIds, windowStart, windowStart],
      );
    }

    // Upload: PUT finalized unsynced own feedings under their local id (idempotent upsert)
    const unsynced = await db.getAllAsync<LocalFeeding>(
      `SELECT ${FEEDING_COLS} FROM feedings WHERE synced = 0 AND ended_at IS NOT NULL AND user_id = ?`,
      [userId],
    );
    for (const row of unsynced) {
      try {
        const putRes = await api.request(`/api/feedings/${row.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            startedAt: row.startedAt,
            endedAt: row.endedAt,
            milkType: row.milkType,
            amountMl: row.amountMl,
            note: row.note,
          }),
        });
        if (putRes.ok) {
          // Only if not edited while the request was in flight — otherwise the edit would never upload
          await db.runAsync('UPDATE feedings SET synced = 1 WHERE id = ? AND updated_at = ?', [
            row.id,
            row.updatedAt,
          ]);
        }
      } catch {
        // best-effort: leave synced=0 for next attempt
      }
    }
  } catch {
    // best-effort: sync errors never affect the local-first view
  }
}

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
  const { user, session, signOut } = useSession();
  const dbRef = useRef<AppDatabase | null>(null);
  const sessionRef = useRef<string | null>(null);
  const signOutRef = useRef(signOut);
  const [feedings, setFeedings] = useState<LocalFeeding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [initialActiveId, setInitialActiveId] = useState<string | null | undefined>(undefined);
  // The running sync, so the 5 s poll joins it instead of overlapping: an older download landing
  // after a newer upload would briefly revert or drop rows.
  const syncInFlightRef = useRef<Promise<void> | null>(null);

  // Latest syncAndReload for the polling effects, so they don't restart on every render
  const syncAndReloadRef = useRef<() => void>(() => {});

  useEffect(() => {
    sessionRef.current = session;
    signOutRef.current = signOut;
  });

  function sync(db: AppDatabase, userId: string, token: string): Promise<void> {
    if (!syncInFlightRef.current) {
      syncInFlightRef.current = syncWithBackend(db, userId, token, () => signOutRef.current()).finally(
        () => {
          syncInFlightRef.current = null;
        },
      );
    }
    return syncInFlightRef.current;
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const db = await openDatabase();
      await runMigrations(db);
      dbRef.current = db;
      if (!cancelled && user) {
        const userId = user.id.toString();
        const rows = await loadFeedings(db);
        setFeedings(rows);
        setInitialActiveId(rows.find((r) => r.endedAt === null)?.id ?? null);
        if (!cancelled) setIsLoading(false);

        const token = sessionRef.current;
        if (token) {
          await sync(db, userId, token);
          if (!cancelled) {
            const syncedRows = await loadFeedings(db);
            setFeedings(syncedRows);
          }
        }
      } else if (!cancelled) {
        setIsLoading(false);
      }
    }

    init().catch(console.error);
    return () => { cancelled = true; };
  }, [user]);

  function syncAndReload() {
    const db = dbRef.current;
    const token = sessionRef.current;
    if (!db || !token || !user) return;
    sync(db, user.id.toString(), token)
      .then(() => loadFeedings(db))
      .then(setFeedings)
      .catch(console.error);
  }

  useEffect(() => {
    syncAndReloadRef.current = syncAndReload;
  });

  // Poll every 5s when a partner is linked
  useEffect(() => {
    if (!hasPartner || !session) return;
    const id = setInterval(() => syncAndReloadRef.current(), 5_000);
    return () => clearInterval(id);
  }, [hasPartner, session, user]);

  // Sync once as soon as the link changes: after an unlink the polling stops, and this sync's
  // download no longer returns the partner's feedings, so they are purged from the list.
  const prevHasPartnerRef = useRef(hasPartner);
  useEffect(() => {
    if (prevHasPartnerRef.current === hasPartner) return;
    prevHasPartnerRef.current = hasPartner;
    const id = setTimeout(() => syncAndReloadRef.current(), 0);
    return () => clearTimeout(id);
  }, [hasPartner]);

  async function reload() {
    const db = dbRef.current;
    if (!db) return;
    const rows = await loadFeedings(db);
    setFeedings(rows);
  }

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
    const db = dbRef.current;
    if (!db || !user) return;
    try {
      const myUserId = user.id.toString();
      const isOwn = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM feedings WHERE id = ? AND user_id = ?',
        [id, myUserId],
      );
      if (isOwn) {
        // Tombstone first, so a sync running in between can't re-download the feeding;
        // the next sync sends the deletion to the server (works offline).
        await db.withTransactionAsync(async () => {
          await db.runAsync(
            'INSERT INTO sync_queue (id, operation, payload, created_at, attempts) VALUES (?, ?, ?, ?, 0)',
            [uuid(), 'DELETE', JSON.stringify({ feedingId: id, userId: myUserId }), nowIso()],
          );
          await db.runAsync('DELETE FROM feedings WHERE id = ? AND user_id = ?', [id, myUserId]);
        });
      } else {
        const api = createApiClient(() => sessionRef.current, () => signOutRef.current());
        const res = await api.request(`/api/feedings/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`Failed to delete partner feeding: ${res.status}`);
        await db.runAsync('DELETE FROM feedings WHERE id = ?', [id]);
      }
      await reload();
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
        // Partner entry: direct API PUT (full replacement); create=false so a feeding the partner
        // deleted meanwhile isn't recreated as ours
        const api = createApiClient(() => sessionRef.current, () => signOutRef.current());
        const res = await api.request(`/api/feedings/${id}?create=false`, {
          method: 'PUT',
          body: JSON.stringify({
            startedAt,
            endedAt,
            milkType: changes.milkType,
            amountMl: changes.amountMl,
            note: changes.note,
          }),
        });
        if (res.status === 404) {
          // Deleted by the partner meanwhile: drop the stale local copy
          await db.runAsync('DELETE FROM feedings WHERE id = ?', [id]);
          await reload();
        }
        if (!res.ok) throw new Error(`Failed to update partner feeding: ${res.status}`);
        const updated = (await res.json()) as ServerFeeding;
        await db.runAsync(
          'UPDATE feedings SET started_at = ?, ended_at = ?, milk_type = ?, duration_minutes = ?, amount_ml = ?, note = ?, updated_at = ? WHERE id = ?',
          [updated.startedAt, updated.endedAt, updated.milkType, updated.durationMinutes, updated.amountMl, updated.note, now, id],
        );
        await reload();
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

  const activeFeeding = feedings.find((f) => f.endedAt === null) ?? null;

  return { feedings, activeFeeding, isLoading, initialActiveId, start, finalize, remove, edit };
}
