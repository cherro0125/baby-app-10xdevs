import { createApiClient } from '@/api/client';
import type { AppDatabase } from '@/db/schema';
import { syncEntity, type EntitySyncConfig } from '@/sync/entity-sync';
import { NodeSqliteDb } from '@/sync/__tests__/node-sqlite-db';

jest.mock('expo-sqlite', () => ({}));

const ME = '1';
const PARTNER = '2';

/** A fresh schema module per test: runMigrations is memoised per module instance. */
function runMigrations(db: NodeSqliteDb): Promise<void> {
  let run!: (db: AppDatabase) => Promise<void>;
  jest.isolateModules(() => {
    run = jest.requireActual<typeof import('@/db/schema')>('@/db/schema').runMigrations;
  });
  return run(db as unknown as AppDatabase);
}

/** A device on v1: tables as the old contraction sync left them. */
function v1Device(rows: string): NodeSqliteDb {
  const db = new NodeSqliteDb();
  db.db.exec(`
    CREATE TABLE contractions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, started_at TEXT NOT NULL,
      ended_at TEXT, duration_seconds INTEGER, strength INTEGER, note TEXT, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, synced INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE sync_queue (id TEXT PRIMARY KEY, operation TEXT NOT NULL, payload TEXT NOT NULL,
      created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
    ${rows}
    PRAGMA user_version = 1;
  `);
  return db;
}

describe('runMigrations v2', () => {
  it('marks synced contractions as legacy and drops only non-feeding queue rows', async () => {
    const db = v1Device(`
      INSERT INTO contractions VALUES ('c1', '1', '2026-10-01T10:00:00Z', '2026-10-01T10:01:00Z', 60, NULL, NULL, 'x', 'x', 1);
      INSERT INTO contractions VALUES ('c2', '1', '2026-10-01T10:05:00Z', '2026-10-01T10:06:00Z', 60, NULL, NULL, 'x', 'x', 0);
      INSERT INTO sync_queue VALUES ('q1', 'DELETE', '{"feedingId":"f1","userId":"1"}', 'x', 0);
      INSERT INTO sync_queue VALUES ('q2', 'CREATE', '{"id":"c1","userId":"1"}', 'x', 0);
      INSERT INTO sync_queue VALUES ('q3', 'DELETE', '{"id":"c3","userId":"1"}', 'x', 0);
    `);

    await runMigrations(db);

    expect(await db.getAllAsync('SELECT id, synced FROM contractions ORDER BY id')).toEqual([
      { id: 'c1', synced: 2 },
      { id: 'c2', synced: 0 },
    ]);
    expect(await db.getAllAsync('SELECT id FROM sync_queue')).toEqual([{ id: 'q1' }]);
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 2 });
  });

  it('leaves exactly the server copies after the first sync', async () => {
    // The old sync kept the local copy (L) and the downloaded copy under the server id (S), and
    // stored a partner row without an end that the partner has since deleted.
    const db = v1Device(`
      INSERT INTO contractions VALUES ('L', '${ME}', '2026-10-01T10:00:00.000Z', '2026-10-01T10:01:00.000Z', 60, NULL, NULL, 'x', 'x', 1);
      INSERT INTO contractions VALUES ('S', '${ME}', '2026-10-01T10:00:00.000Z', '2026-10-01T10:01:00.000Z', 60, NULL, NULL, 'x', 'x', 1);
      INSERT INTO contractions VALUES ('P', '${PARTNER}', '2026-10-01T11:00:00.000Z', NULL, NULL, NULL, NULL, 'x', 'x', 1);
    `);
    await runMigrations(db);

    const server = {
      id: 'S',
      userId: ME,
      startedAt: '2026-10-01T10:00:00.000000Z',
      endedAt: '2026-10-01T10:01:00.000000Z',
      durationSeconds: 60,
      strength: 4,
      note: null,
      createdAt: '2026-10-01T10:01:00.000000Z',
    };
    const methods: string[] = [];
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      methods.push(init?.method ?? 'GET');
      return { ok: true, status: 200, json: async () => [server] } as Response;
    }) as typeof fetch;
    const config: EntitySyncConfig<typeof server> = {
      table: 'contractions',
      endpoint: '/api/contractions',
      tombstoneKey: 'contractionId',
      dataColumns: ['started_at', 'ended_at', 'duration_seconds', 'strength', 'note'],
      fromServer: (row) => [row.startedAt, row.endedAt, row.durationSeconds, row.strength, row.note],
      uploadBody: (row) => ({ startedAt: row.started_at, endedAt: row.ended_at, strength: row.strength, note: row.note }),
    };

    await syncEntity(db, config, ME, createApiClient(() => 'token', () => {}));

    expect(await db.getAllAsync('SELECT id, strength, synced FROM contractions')).toEqual([
      { id: 'S', strength: 4, synced: 1 },
    ]);
    expect(methods).toEqual(['GET']);
  });
});
