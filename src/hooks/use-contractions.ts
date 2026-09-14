import { useEffect, useRef, useState } from 'react';

import { createApiClient } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import type { AppDatabase } from '@/db/schema';
import { openDatabase, runMigrations } from '@/db/schema';
import type { LocalContraction } from '@/db/types';

function nowIso(): string {
  return new Date().toISOString();
}

function uuid(): string {
  // RFC 4122 v4 without crypto.randomUUID — safe in all Hermes environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function computeDuration(startedAt: string, endedAt: string): number {
  return Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000);
}

async function loadContractions(db: AppDatabase): Promise<LocalContraction[]> {
  return db.getAllAsync<LocalContraction>(
    'SELECT * FROM contractions ORDER BY started_at DESC LIMIT 200',
  );
}

async function enqueueSync(
  db: AppDatabase,
  operation: 'CREATE' | 'FINALIZE' | 'DELETE',
  payload: object,
): Promise<void> {
  await db.runAsync(
    'INSERT INTO sync_queue (id, operation, payload, created_at, attempts) VALUES (?, ?, ?, ?, 0)',
    [uuid(), operation, JSON.stringify(payload), nowIso()],
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

async function syncWithBackend(
  db: AppDatabase,
  userId: string,
  token: string,
  onUnauth: () => void,
): Promise<void> {
  try {
    const api = createApiClient(() => token, onUnauth);

    // Download: upsert shared feed — partner rows always replace, own rows insert-if-new
    const res = await api.request('/api/contractions/shared');
    if (res.ok) {
      const serverRows = (await res.json()) as ServerContraction[];
      const now = new Date().toISOString();
      for (const row of serverRows) {
        if (row.userId !== userId) {
          // Partner row: always take the server version
          await db.runAsync(
            'INSERT OR REPLACE INTO contractions (id, user_id, started_at, ended_at, duration_seconds, strength, note, created_at, updated_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
            [row.id, row.userId, row.startedAt, row.endedAt, row.durationSeconds, row.strength, row.note, row.createdAt, now],
          );
        } else {
          // Own row: insert-if-new to preserve unsynced local state
          const exists = await db.getFirstAsync<{ id: string }>(
            'SELECT id FROM contractions WHERE id = ?',
            [row.id],
          );
          if (!exists) {
            await db.runAsync(
              'INSERT INTO contractions (id, user_id, started_at, ended_at, duration_seconds, strength, note, created_at, updated_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
              [row.id, row.userId, row.startedAt, row.endedAt, row.durationSeconds, row.strength, row.note, row.createdAt, now],
            );
          }
        }
      }
      // Purge stale partner rows: delete any local partner rows not in the server response
      // (covers partner deletions — otherwise they'd persist in local DB forever)
      const partnerIds = serverRows.filter((r) => r.userId !== userId).map((r) => r.id);
      if (partnerIds.length > 0) {
        const placeholders = partnerIds.map(() => '?').join(',');
        await db.runAsync(
          `DELETE FROM contractions WHERE user_id != ? AND id NOT IN (${placeholders})`,
          [userId, ...partnerIds],
        );
      } else {
        await db.runAsync('DELETE FROM contractions WHERE user_id != ?', [userId]);
      }
    }

    // Upload: push finished unsynced own contractions (best-effort)
    const unsynced = await db.getAllAsync<LocalContraction>(
      'SELECT * FROM contractions WHERE synced = 0 AND ended_at IS NOT NULL AND user_id = ?',
      [userId],
    );
    for (const row of unsynced) {
      try {
        const createRes = await api.request('/api/contractions', {
          method: 'POST',
          body: JSON.stringify({ startedAt: row.startedAt }),
        });
        if (createRes.ok) {
          const created = (await createRes.json()) as { id: string };
          const patchRes = await api.request(`/api/contractions/${created.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ endedAt: row.endedAt }),
          });
          if (patchRes.ok) {
            await db.runAsync('UPDATE contractions SET synced = 1 WHERE id = ?', [row.id]);
          }
        }
      } catch {
        // best-effort: leave synced=0 for next attempt
      }
    }
  } catch {
    // best-effort: sync errors never affect the local-first view
  }
}

export interface UseContractionsResult {
  contractions: LocalContraction[];
  activeContraction: LocalContraction | null;
  isLoading: boolean;
  /** Id of the active contraction present when the DB first loaded — for crash-recovery detection. */
  initialActiveId: string | null | undefined;
  start: (startedAt: Date) => Promise<void>;
  finalize: (id: string, endedAt: Date, strength?: number | null, note?: string | null) => Promise<void>;
  remove: (id: string) => Promise<void>;
  edit: (id: string, patch: { startedAt?: Date; endedAt?: Date }) => Promise<void>;
}

export function useContractions(hasPartner: boolean): UseContractionsResult {
  const { user, session, signOut } = useSession();
  const dbRef = useRef<AppDatabase | null>(null);
  // Keep session and signOut in refs so they're always current without being effect deps
  const sessionRef = useRef<string | null>(null);
  const signOutRef = useRef(signOut);
  const [contractions, setContractions] = useState<LocalContraction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // undefined = not yet loaded; null = no active contraction at load time; string = id
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
        const rows = await loadContractions(db);
        setContractions(rows);
        setInitialActiveId(rows.find((r) => r.endedAt === null)?.id ?? null);
        if (!cancelled) setIsLoading(false);

        // One-shot backend sync after local data is shown — best-effort
        const token = sessionRef.current;
        if (token) {
          await syncWithBackend(db, userId, token, () => signOutRef.current());
          if (!cancelled) {
            const syncedRows = await loadContractions(db);
            setContractions(syncedRows);
          }
        }
      } else if (!cancelled) {
        setIsLoading(false);
      }
    }

    init().catch(console.error);
    return () => { cancelled = true; };
  }, [user]);

  // Poll shared feed every 5s when a partner is linked
  useEffect(() => {
    if (!hasPartner || !session) return;
    const id = setInterval(() => {
      const db = dbRef.current;
      const token = sessionRef.current;
      if (!db || !token || !user) return;
      syncWithBackend(db, user.id.toString(), token, () => signOutRef.current())
        .then(() => loadContractions(db))
        .then(setContractions)
        .catch(console.error);
    }, 5_000);
    return () => clearInterval(id);
  }, [hasPartner, session, user]);

  async function reload() {
    const db = dbRef.current;
    if (!db) return;
    const rows = await loadContractions(db);
    setContractions(rows);
  }

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
      await enqueueSync(db, 'CREATE', { id, userId, startedAt: startedAt.toISOString() });
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
        'SELECT * FROM contractions WHERE id = ? AND user_id = ?',
        [id, user.id.toString()],
      );
      if (!existing) return;
      const endedAtIso = endedAt.toISOString();
      const durationSeconds = computeDuration(existing.startedAt, endedAtIso);
      const now = nowIso();
      await db.runAsync(
        'UPDATE contractions SET ended_at = ?, duration_seconds = ?, strength = ?, note = ?, updated_at = ?, synced = 0 WHERE id = ?',
        [endedAtIso, durationSeconds, strength ?? null, note ?? null, now, id],
      );
      await enqueueSync(db, 'FINALIZE', { id, endedAt: endedAtIso });
      await reload();
    } catch (e) {
      console.error('[useContractions] finalize failed', e);
      throw e;
    }
  }

  async function remove(id: string): Promise<void> {
    const db = dbRef.current;
    if (!db || !user) return;
    try {
      const myUserId = user.id.toString();
      const isOwn = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM contractions WHERE id = ? AND user_id = ?',
        [id, myUserId],
      );
      if (isOwn) {
        // Own entry: local delete + sync queue
        await db.runAsync('DELETE FROM contractions WHERE id = ? AND user_id = ?', [id, myUserId]);
        await enqueueSync(db, 'DELETE', { id, userId: myUserId });
      } else {
        // Partner entry: direct API delete (online-only, no sync queue)
        const api = createApiClient(() => sessionRef.current, () => signOutRef.current());
        const res = await api.request(`/api/contractions/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`Failed to delete partner contraction: ${res.status}`);
        await db.runAsync('DELETE FROM contractions WHERE id = ?', [id]);
      }
      await reload();
    } catch (e) {
      console.error('[useContractions] remove failed', e);
      throw e;
    }
  }

  async function edit(id: string, patch: { startedAt?: Date; endedAt?: Date }): Promise<void> {
    const db = dbRef.current;
    if (!db || !user) return;
    try {
      const myUserId = user.id.toString();
      const isOwn = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM contractions WHERE id = ? AND user_id = ?',
        [id, myUserId],
      );
      if (!isOwn) {
        // Partner entry: direct API PATCH (online-only, no sync queue)
        const existing = await db.getFirstAsync<LocalContraction>(
          'SELECT * FROM contractions WHERE id = ?',
          [id],
        );
        if (!existing) return;
        const endedAt = patch.endedAt?.toISOString() ?? existing.endedAt;
        if (!endedAt) throw new Error('Cannot edit active partner contraction');
        const body: { startedAt?: string; endedAt: string } = { endedAt };
        if (patch.startedAt) body.startedAt = patch.startedAt.toISOString();
        const api = createApiClient(() => sessionRef.current, () => signOutRef.current());
        const res = await api.request(`/api/contractions/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Failed to update partner contraction: ${res.status}`);
        const updated = (await res.json()) as ServerContraction;
        const now = nowIso();
        await db.runAsync(
          'UPDATE contractions SET started_at = ?, ended_at = ?, duration_seconds = ?, updated_at = ? WHERE id = ?',
          [updated.startedAt, updated.endedAt, updated.durationSeconds, now, id],
        );
        await reload();
        return;
      }
      // Own entry: local-first flow
      const existing = await db.getFirstAsync<LocalContraction>(
        'SELECT * FROM contractions WHERE id = ? AND user_id = ?',
        [id, myUserId],
      );
      if (!existing) return;
      const newStartedAt = patch.startedAt?.toISOString() ?? existing.startedAt;
      const newEndedAt = patch.endedAt?.toISOString() ?? existing.endedAt;
      if (newEndedAt && newEndedAt <= newStartedAt) {
        throw new Error('endedAt must be after startedAt');
      }
      const newDuration = newEndedAt ? computeDuration(newStartedAt, newEndedAt) : null;
      const now = nowIso();
      await db.runAsync(
        'UPDATE contractions SET started_at = ?, ended_at = ?, duration_seconds = ?, updated_at = ?, synced = 0 WHERE id = ?',
        [newStartedAt, newEndedAt, newDuration, now, id],
      );
      if (newEndedAt) {
        await enqueueSync(db, 'FINALIZE', { id, startedAt: newStartedAt, endedAt: newEndedAt });
      }
      await reload();
    } catch (e) {
      console.error('[useContractions] edit failed', e);
      throw e;
    }
  }

  const activeContraction = contractions.find((c) => c.endedAt === null) ?? null;

  return { contractions, activeContraction, isLoading, initialActiveId, start, finalize, remove, edit };
}
