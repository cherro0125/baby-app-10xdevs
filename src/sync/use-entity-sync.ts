import { useEffect, useRef, useState } from 'react';

import { createApiClient } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import type { AppDatabase } from '@/db/schema';
import { openDatabase, runMigrations } from '@/db/schema';

import {
  createSyncRunner,
  deleteEntry,
  editPartnerEntry,
  syncEntity,
  type EntitySyncConfig,
} from './entity-sync';

export interface UseEntitySyncResult<TLocal> {
  rows: TLocal[];
  isLoading: boolean;
  /** Own running row at first load (crash recovery); partner rows never count as running. */
  initialActiveId: string | null | undefined;
  dbRef: React.RefObject<AppDatabase | null>;
  reload: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  editPartner: (id: string, body: object) => Promise<void>;
}

/**
 * The React side of an entity's sync: local load, sync on start, 5 s polling while a partner is
 * linked, and the online delete / partner-edit paths. `config` and `load` must be module-level.
 */
export function useEntitySync<TLocal extends { id: string; userId: string; endedAt: string | null }>(
  config: EntitySyncConfig<any>,
  hasPartner: boolean,
  load: (db: AppDatabase) => Promise<TLocal[]>,
): UseEntitySyncResult<TLocal> {
  const { user, session, signOut } = useSession();
  const dbRef = useRef<AppDatabase | null>(null);
  const sessionRef = useRef<string | null>(null);
  const signOutRef = useRef(signOut);
  const [rows, setRows] = useState<TLocal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [initialActiveId, setInitialActiveId] = useState<string | null | undefined>(undefined);
  // The running sync, so the 5 s poll joins it instead of overlapping
  const [runSync] = useState(createSyncRunner);

  // Latest syncAndReload for the polling effects, so they don't restart on every render
  const syncAndReloadRef = useRef<() => void>(() => {});

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
        const loaded = await load(db);
        setRows(loaded);
        setInitialActiveId(loaded.find((r) => r.userId === userId && r.endedAt === null)?.id ?? null);
        if (!cancelled) setIsLoading(false);

        const token = sessionRef.current;
        if (token) {
          const api = createApiClient(() => token, () => signOutRef.current());
          await runSync(() => syncEntity(db, config, userId, api));
          if (!cancelled) setRows(await load(db));
        }
      } else if (!cancelled) {
        setIsLoading(false);
      }
    }

    init().catch(console.error);
    return () => { cancelled = true; };
  }, [user, config, load, runSync]);

  function syncAndReload() {
    const db = dbRef.current;
    const token = sessionRef.current;
    if (!db || !token || !user) return;
    const api = createApiClient(() => token, () => signOutRef.current());
    runSync(() => syncEntity(db, config, user.id.toString(), api))
      .then(() => load(db))
      .then(setRows)
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
  // download no longer returns the partner's entries, so they are purged from the list.
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
    setRows(await load(db));
  }

  // Both throw rather than return when not ready: sheets treat a resolved promise as done and close.
  async function remove(id: string): Promise<void> {
    const db = dbRef.current;
    if (!db || !user) throw new Error(`remove before the ${config.table} database is ready`);
    const api = createApiClient(() => sessionRef.current, () => signOutRef.current());
    await deleteEntry(db, config, api, id, user.id.toString());
    await reload();
  }

  async function editPartner(id: string, body: object): Promise<void> {
    const db = dbRef.current;
    if (!db || !user) throw new Error(`edit before the ${config.table} database is ready`);
    const api = createApiClient(() => sessionRef.current, () => signOutRef.current());
    try {
      await editPartnerEntry(db, config, api, id, body);
    } finally {
      // Also after a 404, so the dropped row disappears at once; a reload error must not mask the edit's
      await reload().catch(console.error);
    }
  }

  return { rows, isLoading, initialActiveId, dbRef, reload, remove, editPartner };
}
