import { useEffect, useRef, useState } from 'react';

import { createApiClient } from '@/api/client';
import { useSession } from '@/auth/session-provider';
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
          // Own row: insert-if-new to preserve unsynced local state
          const exists = await db.getFirstAsync<{ id: string }>(
            'SELECT id FROM feedings WHERE id = ?',
            [row.id],
          );
          if (!exists) {
            await db.runAsync(
              'INSERT INTO feedings (id, user_id, milk_type, started_at, ended_at, duration_minutes, amount_ml, note, created_at, updated_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
              [row.id, row.userId, row.milkType, row.startedAt, row.endedAt, row.durationMinutes, row.amountMl, row.note, row.createdAt, now],
            );
          }
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
    }

    // Upload: push finalized unsynced own feedings (single POST — no two-step)
    const unsynced = await db.getAllAsync<LocalFeeding>(
      `SELECT ${FEEDING_COLS} FROM feedings WHERE synced = 0 AND ended_at IS NOT NULL AND user_id = ?`,
      [userId],
    );
    for (const row of unsynced) {
      try {
        const postRes = await api.request('/api/feedings', {
          method: 'POST',
          body: JSON.stringify({
            startedAt: row.startedAt,
            endedAt: row.endedAt,
            milkType: row.milkType,
            amountMl: row.amountMl,
            note: row.note,
          }),
        });
        if (postRes.ok) {
          await db.runAsync('UPDATE feedings SET synced = 1 WHERE id = ?', [row.id]);
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
  edit: (id: string, patch: { startedAt?: Date; endedAt?: Date }) => Promise<void>;
}

export function useFeedings(hasPartner: boolean): UseFeedingsResult {
  const { user, session, signOut } = useSession();
  const dbRef = useRef<AppDatabase | null>(null);
  const sessionRef = useRef<string | null>(null);
  const signOutRef = useRef(signOut);
  const [feedings, setFeedings] = useState<LocalFeeding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [initialActiveId, setInitialActiveId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    sessionRef.current = session;
    signOutRef.current = signOut;
  });

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
          await syncWithBackend(db, userId, token, () => signOutRef.current());
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

  // Poll every 5s when a partner is linked
  useEffect(() => {
    if (!hasPartner || !session) return;
    const id = setInterval(() => {
      const db = dbRef.current;
      const token = sessionRef.current;
      if (!db || !token || !user) return;
      syncWithBackend(db, user.id.toString(), token, () => signOutRef.current())
        .then(() => loadFeedings(db))
        .then(setFeedings)
        .catch(console.error);
    }, 5_000);
    return () => clearInterval(id);
  }, [hasPartner, session, user]);

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
      const durationMinutes = Math.round(
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
        await db.runAsync('DELETE FROM feedings WHERE id = ? AND user_id = ?', [id, myUserId]);
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

  async function edit(id: string, patch: { startedAt?: Date; endedAt?: Date }): Promise<void> {
    const db = dbRef.current;
    if (!db || !user) return;
    try {
      const myUserId = user.id.toString();
      const isOwn = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM feedings WHERE id = ? AND user_id = ?',
        [id, myUserId],
      );
      if (!isOwn) {
        // Partner entry: direct API PATCH
        const existing = await db.getFirstAsync<LocalFeeding>(
          `SELECT ${FEEDING_COLS} FROM feedings WHERE id = ?`,
          [id],
        );
        if (!existing) return;
        const endedAt = patch.endedAt?.toISOString() ?? existing.endedAt;
        if (!endedAt) throw new Error('Cannot edit active partner feeding');
        const body: { startedAt?: string; endedAt: string } = { endedAt };
        if (patch.startedAt) body.startedAt = patch.startedAt.toISOString();
        const api = createApiClient(() => sessionRef.current, () => signOutRef.current());
        const res = await api.request(`/api/feedings/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Failed to update partner feeding: ${res.status}`);
        const updated = (await res.json()) as ServerFeeding;
        const now = nowIso();
        await db.runAsync(
          'UPDATE feedings SET started_at = ?, ended_at = ?, duration_minutes = ?, updated_at = ? WHERE id = ?',
          [updated.startedAt, updated.endedAt, updated.durationMinutes, now, id],
        );
        await reload();
        return;
      }
      // Own entry: local-first flow
      const existing = await db.getFirstAsync<LocalFeeding>(
        `SELECT ${FEEDING_COLS} FROM feedings WHERE id = ? AND user_id = ?`,
        [id, myUserId],
      );
      if (!existing) return;
      const newStartedAt = patch.startedAt?.toISOString() ?? existing.startedAt;
      const newEndedAt = patch.endedAt?.toISOString() ?? existing.endedAt;
      if (newEndedAt && newEndedAt <= newStartedAt) {
        throw new Error('endedAt must be after startedAt');
      }
      const newDuration = newEndedAt
        ? Math.round((new Date(newEndedAt).getTime() - new Date(newStartedAt).getTime()) / 60_000)
        : null;
      const now = nowIso();
      await db.runAsync(
        'UPDATE feedings SET started_at = ?, ended_at = ?, duration_minutes = ?, updated_at = ?, synced = 0 WHERE id = ?',
        [newStartedAt, newEndedAt, newDuration, now, id],
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
