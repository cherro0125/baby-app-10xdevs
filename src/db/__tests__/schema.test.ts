import type { AppDatabase } from '@/db/schema';
import { runMigrations } from '@/db/schema';
import { NodeSqliteDb } from '@/sync/__tests__/node-sqlite-db';

jest.mock('expo-sqlite', () => ({}));

describe('runMigrations v2', () => {
  it('marks synced contractions as legacy and drops only non-feeding queue rows', async () => {
    const db = new NodeSqliteDb();
    // A device on v1: contractions as the old sync left them, plus its queue rows
    db.db.exec(`
      CREATE TABLE contractions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, started_at TEXT NOT NULL,
        ended_at TEXT, duration_seconds INTEGER, strength INTEGER, note TEXT, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL, synced INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE sync_queue (id TEXT PRIMARY KEY, operation TEXT NOT NULL, payload TEXT NOT NULL,
        created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
      INSERT INTO contractions VALUES ('c1', '1', '2026-10-01T10:00:00Z', '2026-10-01T10:01:00Z', 60, NULL, NULL, 'x', 'x', 1);
      INSERT INTO contractions VALUES ('c2', '1', '2026-10-01T10:05:00Z', '2026-10-01T10:06:00Z', 60, NULL, NULL, 'x', 'x', 0);
      INSERT INTO sync_queue VALUES ('q1', 'DELETE', '{"feedingId":"f1","userId":"1"}', 'x', 0);
      INSERT INTO sync_queue VALUES ('q2', 'CREATE', '{"id":"c1","userId":"1"}', 'x', 0);
      INSERT INTO sync_queue VALUES ('q3', 'DELETE', '{"id":"c3","userId":"1"}', 'x', 0);
      PRAGMA user_version = 1;
    `);

    await runMigrations(db as unknown as AppDatabase);

    expect(await db.getAllAsync('SELECT id, synced FROM contractions ORDER BY id')).toEqual([
      { id: 'c1', synced: 2 },
      { id: 'c2', synced: 0 },
    ]);
    expect(await db.getAllAsync('SELECT id FROM sync_queue')).toEqual([{ id: 'q1' }]);
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 2 });
  });
});
