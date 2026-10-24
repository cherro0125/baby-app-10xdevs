import type { SQLiteBindValue } from 'expo-sqlite';

import type { ApiClient } from '@/api/client';
import type { AppDatabase } from '@/db/schema';

import { nowIso, uuid } from './ids';

type ServerRow = {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
};

/** The expo-sqlite subset the engine uses; AppDatabase satisfies it, the test adapter implements it. */
export type SyncDb = Pick<
  AppDatabase,
  'runAsync' | 'getAllAsync' | 'getFirstAsync' | 'execAsync' | 'withTransactionAsync'
>;

export interface EntitySyncConfig<TServer extends ServerRow> {
  table: 'feedings' | 'contractions' | 'sleeps';
  /** e.g. '/api/feedings' — PUT/DELETE `${endpoint}/{id}`, GET `${endpoint}/shared` */
  endpoint: string;
  /** sync_queue payload key: 'feedingId' (existing), 'contractionId', 'sleepId' */
  tombstoneKey: string;
  /** Columns besides id, user_id, created_at, updated_at, synced */
  dataColumns: readonly string[];
  /** Values in dataColumns order */
  fromServer: (row: TServer) => unknown[];
  /** Full-replacement PUT body from a local snake_case row */
  uploadBody: (row: Record<string, unknown>) => object;
}

// Matches the backend's findTop200…OrderByStartedAtDesc for GET `${endpoint}/shared`.
const SHARED_PAGE_SIZE = 200;

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

function columnsOf(config: EntitySyncConfig<any>): string[] {
  return ['id', 'user_id', ...config.dataColumns, 'created_at', 'updated_at', 'synced'];
}

function rowValues<T extends ServerRow>(config: EntitySyncConfig<T>, row: T, now: string): SQLiteBindValue[] {
  return [row.id, row.userId, ...(config.fromServer(row) as SQLiteBindValue[]), row.createdAt, now, 1];
}

/**
 * Stores one downloaded shared page: partner and own rows, purges, then legacy-row resolution.
 * Server rows are newest first (startedAt DESC).
 */
async function applyDownload<T extends ServerRow>(
  db: SyncDb,
  config: EntitySyncConfig<T>,
  userId: string,
  page: T[],
): Promise<void> {
  const { table } = config;
  const tombstonePath = `$.${config.tombstoneKey}`;
  // Only finished entries are synced. Legacy contraction uploads left server rows without an
  // end (POST succeeded, PATCH failed); they must not show up as running.
  const serverRows = page.filter((r) => r.endedAt != null);
  const now = nowIso();
  const columns = columnsOf(config);
  const columnList = columns.join(', ');
  const values = placeholders(columns.length);
  const updateSet = [...config.dataColumns, 'created_at', 'updated_at']
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');
  for (const row of serverRows) {
    if (row.userId !== userId) {
      // Partner row: always take the server version (legacy partner rows already carry server ids)
      await db.runAsync(
        `INSERT OR REPLACE INTO ${table} (${columnList}) VALUES (${values})`,
        rowValues(config, row, now),
      );
    } else {
      // Own row: server wins unless a local edit is still waiting for upload (synced = 0), the
      // row is a legacy one not yet matched (synced = 2), or it was deleted locally.
      // One statement, so a concurrent edit or delete can't be overwritten.
      await db.runAsync(
        `INSERT INTO ${table} (${columnList})
         SELECT ${values}
         WHERE NOT EXISTS (
           SELECT 1 FROM sync_queue
           WHERE operation = 'DELETE' AND json_extract(payload, ?) = ?
         )
         ON CONFLICT(id) DO UPDATE SET ${updateSet}, synced = 1
         WHERE ${table}.synced = 1`,
        [...rowValues(config, row, now), tombstonePath, row.id],
      );
    }
  }
  // Purge stale partner rows not in the server response. Only downloaded rows (synced = 1):
  // pending and legacy rows of another account that used this device must survive.
  const partnerIds = serverRows.filter((r) => r.userId !== userId).map((r) => r.id);
  const notInPartner = partnerIds.length > 0 ? `AND id NOT IN (${placeholders(partnerIds.length)})` : '';
  await db.runAsync(`DELETE FROM ${table} WHERE user_id != ? AND synced = 1 ${notInPartner}`, [
    userId,
    ...partnerIds,
  ]);
  // Purge own rows deleted on the server (e.g. by the partner): a synced row missing from the
  // response is gone there. Unsynced and legacy rows are kept. A full page only covers its
  // startedAt window, so older rows are left alone. julianday() because server and local
  // timestamps differ in fractional-second digits.
  const ownRows = serverRows.filter((r) => r.userId === userId);
  const ownIds = ownRows.map((r) => r.id);
  // The server sorts by startedAt DESC, so the last row is the oldest.
  const windowStart = page.length >= SHARED_PAGE_SIZE ? page[page.length - 1].startedAt : null;
  const notInOwn = ownIds.length > 0 ? `AND id NOT IN (${placeholders(ownIds.length)})` : '';
  await db.runAsync(
    `DELETE FROM ${table} WHERE user_id = ? AND synced = 1 ${notInOwn}
     AND (? IS NULL OR julianday(started_at) >= julianday(?))`,
    [userId, ...ownIds, windowStart, windowStart],
  );

  // Legacy rows (synced = 2): stored under a local id while the server assigned its own.
  // A server row with the same start is the same entry, just downloaded under its server id,
  // so the local copy goes. Without a match the server lacks it: upload it under the local id.
  // Rows older than a full page's window can't be matched yet, so they stay legacy.
  const ownStarts = JSON.stringify(ownRows.map((r) => r.startedAt));
  await db.runAsync(
    `DELETE FROM ${table} WHERE user_id = ? AND synced = 2
     AND EXISTS (SELECT 1 FROM json_each(?) WHERE julianday(value) = julianday(${table}.started_at))`,
    [userId, ownStarts],
  );
  await db.runAsync(
    `UPDATE ${table} SET synced = 0 WHERE user_id = ? AND synced = 2
     AND (? IS NULL OR julianday(started_at) >= julianday(?))`,
    [userId, windowStart, windowStart],
  );
}

/**
 * One best-effort sync of an entity: tombstones, download, legacy resolution, upload.
 * Never throws — sync errors never affect the local-first view.
 */
export async function syncEntity<T extends ServerRow>(
  db: SyncDb,
  config: EntitySyncConfig<T>,
  userId: string,
  api: ApiClient,
): Promise<void> {
  const { table, endpoint } = config;
  const tombstonePath = `$.${config.tombstoneKey}`;
  try {
    // Deletions: send queued own deletions first, so the download no longer returns them.
    // Only this user's: another account's token would get a 404 and drop the tombstone.
    // Tombstones written before userId was recorded are sent by whoever syncs first.
    const tombstones = await db.getAllAsync<{ id: string; entryId: string }>(
      `SELECT id, json_extract(payload, ?) AS entryId FROM sync_queue
       WHERE operation = 'DELETE' AND json_extract(payload, ?) IS NOT NULL
         AND COALESCE(json_extract(payload, '$.userId'), ?) = ?`,
      [tombstonePath, tombstonePath, userId, userId],
    );
    for (const tombstone of tombstones) {
      try {
        const delRes = await api.request(`${endpoint}/${tombstone.entryId}`, { method: 'DELETE' });
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

    // Download: upsert the shared feed
    const res = await api.request(`${endpoint}/shared`);
    if (res.ok) {
      try {
        await applyDownload(db, config, userId, (await res.json()) as T[]);
      } catch {
        // malformed response or a failed write: pending rows are still uploaded below
      }
    }

    // Upload: PUT finished unsynced own rows under their local id (idempotent upsert)
    const unsynced = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${table} WHERE synced = 0 AND ended_at IS NOT NULL AND user_id = ?`,
      [userId],
    );
    for (const row of unsynced) {
      try {
        const putRes = await api.request(`${endpoint}/${row.id}`, {
          method: 'PUT',
          body: JSON.stringify(config.uploadBody(row)),
        });
        if (putRes.ok) {
          // Only if not edited while the request was in flight — otherwise the edit would never upload
          await db.runAsync(`UPDATE ${table} SET synced = 1 WHERE id = ? AND updated_at = ?`, [
            row.id as string,
            row.updated_at as string,
          ]);
        }
      } catch {
        // best-effort: leave synced = 0 for next attempt
      }
    }
  } catch {
    // best-effort: sync errors never affect the local-first view
  }
}

/**
 * Own row: tombstone plus local delete, so a sync running in between can't re-download it; the next
 * sync sends the deletion (works offline). Partner row: deleted online; throws on failure.
 */
export async function deleteEntry<T extends ServerRow>(
  db: SyncDb,
  config: EntitySyncConfig<T>,
  api: ApiClient,
  id: string,
  userId: string,
): Promise<void> {
  const { table } = config;
  const isOwn = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM ${table} WHERE id = ? AND user_id = ?`,
    [id, userId],
  );
  if (isOwn) {
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        'INSERT INTO sync_queue (id, operation, payload, created_at, attempts) VALUES (?, ?, ?, ?, 0)',
        [uuid(), 'DELETE', JSON.stringify({ [config.tombstoneKey]: id, userId }), nowIso()],
      );
      await db.runAsync(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`, [id, userId]);
    });
  } else {
    const res = await api.request(`${config.endpoint}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to delete partner entry in ${table}: ${res.status}`);
    await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, [id]);
  }
}

/**
 * Partner entry: direct full-replacement PUT. create=false, so an entry the partner deleted
 * meanwhile isn't recreated as ours; on 404 the stale local copy is dropped.
 */
export async function editPartnerEntry<T extends ServerRow>(
  db: SyncDb,
  config: EntitySyncConfig<T>,
  api: ApiClient,
  id: string,
  body: object,
): Promise<void> {
  const { table } = config;
  const res = await api.request(`${config.endpoint}/${id}?create=false`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (res.status === 404) {
    await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, [id]);
  }
  if (!res.ok) throw new Error(`Failed to update partner entry in ${table}: ${res.status}`);
  const updated = (await res.json()) as T;
  const updateSet = config.dataColumns.map((c) => `${c} = ?`).join(', ');
  await db.runAsync(`UPDATE ${table} SET ${updateSet}, updated_at = ?, synced = 1 WHERE id = ?`, [
    ...(config.fromServer(updated) as SQLiteBindValue[]),
    nowIso(),
    id,
  ]);
}

/** One shared in-flight promise: calls while a run is pending join it; cleared when it settles. */
export function createSyncRunner(): (run: () => Promise<void>) => Promise<void> {
  // An older download landing after a newer upload would briefly revert or drop rows.
  let inFlight: Promise<void> | null = null;
  return (run) => {
    inFlight ??= run().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
