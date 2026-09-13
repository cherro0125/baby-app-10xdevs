import { useEffect, useRef, useState } from 'react';

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

async function loadContractions(db: AppDatabase, userId: string): Promise<LocalContraction[]> {
  return db.getAllAsync<LocalContraction>(
    'SELECT * FROM contractions WHERE user_id = ? ORDER BY started_at DESC',
    [userId],
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

export function useContractions(): UseContractionsResult {
  const { user } = useSession();
  const dbRef = useRef<AppDatabase | null>(null);
  const [contractions, setContractions] = useState<LocalContraction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // undefined = not yet loaded; null = no active contraction at load time; string = id
  const [initialActiveId, setInitialActiveId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const db = await openDatabase();
      await runMigrations(db);
      dbRef.current = db;
      if (!cancelled && user) {
        const rows = await loadContractions(db, user.id.toString());
        setContractions(rows);
        setInitialActiveId(rows.find((r) => r.endedAt === null)?.id ?? null);
      }
      if (!cancelled) setIsLoading(false);
    }

    init().catch(console.error);
    return () => { cancelled = true; };
  }, [user]);

  async function reload() {
    const db = dbRef.current;
    if (!db || !user) return;
    const rows = await loadContractions(db, user.id.toString());
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
      await db.runAsync(
        'DELETE FROM contractions WHERE id = ? AND user_id = ?',
        [id, user.id.toString()],
      );
      await enqueueSync(db, 'DELETE', { id, userId: user.id.toString() });
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
      const existing = await db.getFirstAsync<LocalContraction>(
        'SELECT * FROM contractions WHERE id = ? AND user_id = ?',
        [id, user.id.toString()],
      );
      if (!existing) return;
      const newStartedAt = patch.startedAt?.toISOString() ?? existing.startedAt;
      const newEndedAt = patch.endedAt?.toISOString() ?? existing.endedAt;
      if (newEndedAt && newEndedAt <= newStartedAt) {
        throw new Error('endedAt must be after startedAt');
      }
      const newDuration =
        newEndedAt ? computeDuration(newStartedAt, newEndedAt) : null;
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
