import { createApiClient } from '@/api/client';
import {
  createSyncRunner,
  deleteEntry,
  editPartnerEntry,
  syncEntity,
  type EntitySyncConfig,
} from '@/sync/entity-sync';

import { NodeSqliteDb } from './node-sqlite-db';

const ME = '1';
const PARTNER = '2';

interface ServerFeeding {
  id: string;
  userId: string;
  milkType: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  amountMl: number | null;
  note: string | null;
  createdAt: string;
}

const CONFIG: EntitySyncConfig<ServerFeeding> = {
  table: 'feedings',
  endpoint: '/api/feedings',
  tombstoneKey: 'feedingId',
  dataColumns: ['milk_type', 'started_at', 'ended_at', 'duration_minutes', 'amount_ml', 'note'],
  fromServer: (row) => [row.milkType, row.startedAt, row.endedAt, row.durationMinutes, row.amountMl, row.note],
  uploadBody: (row) => ({
    startedAt: row.started_at,
    endedAt: row.ended_at,
    milkType: row.milk_type,
    amountMl: row.amount_ml,
    note: row.note,
  }),
};

interface Call {
  method: string;
  path: string;
  body: unknown;
}

interface Reply {
  status: number;
  json?: unknown;
}

let db: NodeSqliteDb;
let calls: Call[];
const api = createApiClient(() => 'token', () => {});

/** Routes fetch to `handler`; unhandled requests succeed with an empty body. */
function mockServer(handler: (call: Call) => Reply | undefined | Promise<Reply | undefined>) {
  calls = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const call: Call = {
      method: init?.method ?? 'GET',
      path: url.pathname + url.search,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const reply = (await handler(call)) ?? { status: 200, json: {} };
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.json,
    } as Response;
  }) as typeof fetch;
}

function sharedFeed(rows: ServerFeeding[]) {
  return (call: Call): Reply | undefined =>
    call.method === 'GET' && call.path === '/api/feedings/shared' ? { status: 200, json: rows } : undefined;
}

function serverFeeding(id: string, userId: string, startedAt: string, extra: Partial<ServerFeeding> = {}): ServerFeeding {
  return {
    id,
    userId,
    milkType: 'BREAST',
    startedAt,
    endedAt: new Date(new Date(startedAt).getTime() + 15 * 60_000).toISOString(),
    durationMinutes: 15,
    amountMl: null,
    note: null,
    createdAt: startedAt,
    ...extra,
  };
}

interface LocalRow {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  note: string | null;
  updated_at: string;
  synced: number;
}

async function insertLocal(row: Partial<LocalRow> & { id: string }) {
  const r: LocalRow = {
    user_id: ME,
    started_at: '2026-10-20T10:00:00.000Z',
    ended_at: '2026-10-20T10:15:00.000Z',
    note: null,
    updated_at: '2026-10-20T10:15:00.000Z',
    synced: 1,
    ...row,
  };
  await db.runAsync(
    `INSERT INTO feedings (id, user_id, milk_type, started_at, ended_at, duration_minutes, amount_ml, note, created_at, updated_at, synced)
     VALUES (?, ?, 'BREAST', ?, ?, 15, NULL, ?, ?, ?, ?)`,
    [r.id, r.user_id, r.started_at, r.ended_at, r.note, r.started_at, r.updated_at, r.synced],
  );
}

async function local(id: string) {
  return db.getFirstAsync<LocalRow>('SELECT * FROM feedings WHERE id = ?', [id]);
}

async function localIds() {
  const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM feedings ORDER BY id');
  return rows.map((r) => r.id);
}

async function queueTombstone(payload: object) {
  await db.runAsync(
    "INSERT INTO sync_queue (id, operation, payload, created_at, attempts) VALUES (?, 'DELETE', ?, '2026-10-20T00:00:00Z', 0)",
    [`q-${JSON.stringify(payload)}`, JSON.stringify(payload)],
  );
}

beforeEach(async () => {
  db = new NodeSqliteDb();
  await db.execAsync(`
    CREATE TABLE feedings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      milk_type TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_minutes INTEGER,
      amount_ml INTEGER,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE sync_queue (
      id TEXT PRIMARY KEY,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );
  `);
  mockServer(sharedFeed([]));
});

describe('syncEntity upload', () => {
  it('PUTs finished unsynced own rows under their local id and marks them synced', async () => {
    await insertLocal({ id: 'local-1', synced: 0, note: 'hi' });
    await insertLocal({ id: 'running', synced: 0, ended_at: null });

    await syncEntity(db, CONFIG, ME, api);

    const puts = calls.filter((c) => c.method === 'PUT');
    expect(puts).toEqual([
      {
        method: 'PUT',
        path: '/api/feedings/local-1',
        body: {
          startedAt: '2026-10-20T10:00:00.000Z',
          endedAt: '2026-10-20T10:15:00.000Z',
          milkType: 'BREAST',
          amountMl: null,
          note: 'hi',
        },
      },
    ]);
    expect((await local('local-1'))?.synced).toBe(1);
    expect((await local('running'))?.synced).toBe(0);
  });

  it('does not mark a row synced when it was edited while the PUT was in flight', async () => {
    await insertLocal({ id: 'local-1', synced: 0 });
    mockServer(async (call) => {
      if (call.method === 'PUT') {
        await db.runAsync("UPDATE feedings SET note = 'edited', updated_at = '2026-10-21T00:00:00.000Z' WHERE id = 'local-1'");
      }
      return sharedFeed([])(call);
    });

    await syncEntity(db, CONFIG, ME, api);

    expect(await local('local-1')).toMatchObject({ note: 'edited', synced: 0 });
  });
});

describe('syncEntity download', () => {
  it('keeps a pending local edit', async () => {
    await insertLocal({ id: 'f1', synced: 0, note: 'local' });
    mockServer(sharedFeed([serverFeeding('f1', ME, '2026-10-20T10:00:00.000Z', { note: 'server' })]));

    await syncEntity(db, CONFIG, ME, api);

    expect((await local('f1'))?.note).toBe('local');
  });

  it('lets a server change overwrite a clean own row', async () => {
    await insertLocal({ id: 'f1', synced: 1, note: 'old' });
    mockServer(sharedFeed([serverFeeding('f1', ME, '2026-10-20T10:00:00.000Z', { note: 'new' })]));

    await syncEntity(db, CONFIG, ME, api);

    expect(await local('f1')).toMatchObject({ note: 'new', synced: 1 });
  });

  it('does not re-insert a tombstoned own row', async () => {
    await queueTombstone({ feedingId: 'gone', userId: ME });
    mockServer((call) => {
      // The deletion fails, so the server still returns the row
      if (call.method === 'DELETE') return { status: 500 };
      return sharedFeed([serverFeeding('gone', ME, '2026-10-20T10:00:00.000Z')])(call);
    });

    await syncEntity(db, CONFIG, ME, api);

    expect(await local('gone')).toBeNull();
    const queue = await db.getAllAsync<{ attempts: number }>('SELECT attempts FROM sync_queue');
    expect(queue).toEqual([{ attempts: 1 }]);
  });

  it('stores partner rows and purges partner rows missing from the server', async () => {
    await insertLocal({ id: 'p-old', user_id: PARTNER });
    mockServer(sharedFeed([serverFeeding('p-new', PARTNER, '2026-10-20T11:00:00.000Z')]));

    await syncEntity(db, CONFIG, ME, api);

    expect(await localIds()).toEqual(['p-new']);
  });

  it('keeps pending rows of another account that used this device', async () => {
    await insertLocal({ id: 'other-pending', user_id: '3', synced: 0 });
    await insertLocal({ id: 'other-synced', user_id: '3', synced: 1 });

    await syncEntity(db, CONFIG, ME, api);

    expect(await localIds()).toEqual(['other-pending']);
    expect(calls.filter((c) => c.method === 'PUT')).toEqual([]);
  });

  it('purges legacy partner rows missing from the server, including ones without an end', async () => {
    await insertLocal({ id: 'p-legacy', user_id: PARTNER, synced: 2 });
    await insertLocal({ id: 'p-open', user_id: PARTNER, synced: 2, ended_at: null });
    await insertLocal({ id: 'p-kept', user_id: PARTNER, synced: 2, note: 'old' });
    mockServer(sharedFeed([serverFeeding('p-kept', PARTNER, '2026-10-20T10:00:00.000Z', { note: 'server' })]));

    await syncEntity(db, CONFIG, ME, api);

    expect(await localIds()).toEqual(['p-kept']);
    expect(await local('p-kept')).toMatchObject({ note: 'server', synced: 1 });
  });

  it('purges own synced rows missing from the server only inside a full page window', async () => {
    const base = Date.parse('2026-10-01T00:00:00.000Z');
    const page = Array.from({ length: 200 }, (_, i) =>
      serverFeeding(`s-${String(i).padStart(3, '0')}`, PARTNER, new Date(base + (200 - i) * 3_600_000).toISOString()),
    );
    // page[199] is the oldest: base + 1 h
    await insertLocal({ id: 'inside', started_at: new Date(base + 10 * 3_600_000).toISOString() });
    await insertLocal({ id: 'outside', started_at: new Date(base - 3_600_000).toISOString() });
    await insertLocal({ id: 'unsynced', synced: 0, started_at: new Date(base + 10 * 3_600_000).toISOString() });
    mockServer(sharedFeed(page));

    await syncEntity(db, CONFIG, ME, api);

    expect(await local('inside')).toBeNull();
    expect(await local('outside')).not.toBeNull();
    expect(await local('unsynced')).not.toBeNull();
  });

  it('purges own synced rows missing from a partial page regardless of age', async () => {
    await insertLocal({ id: 'old', started_at: '2020-01-01T00:00:00.000Z' });
    await insertLocal({ id: 'kept', started_at: '2026-10-20T10:00:00.000Z' });
    mockServer(sharedFeed([serverFeeding('kept', ME, '2026-10-20T10:00:00.000Z')]));

    await syncEntity(db, CONFIG, ME, api);

    expect(await localIds()).toEqual(['kept']);
  });

  it('does not store server rows without an end', async () => {
    mockServer(
      sharedFeed([
        serverFeeding('own-open', ME, '2026-10-20T10:00:00.000Z', { endedAt: null }),
        serverFeeding('partner-open', PARTNER, '2026-10-20T11:00:00.000Z', { endedAt: null }),
      ]),
    );

    await syncEntity(db, CONFIG, ME, api);

    expect(await localIds()).toEqual([]);
  });
});

describe('syncEntity tombstones', () => {
  it('sends only the current user’s tombstones, plus legacy ones without a userId', async () => {
    await queueTombstone({ feedingId: 'mine', userId: ME });
    await queueTombstone({ feedingId: 'theirs', userId: PARTNER });
    await queueTombstone({ feedingId: 'legacy' });
    await queueTombstone({ contractionId: 'other-entity', userId: ME });
    mockServer((call) => (call.method === 'DELETE' && call.path.endsWith('/legacy') ? { status: 404 } : sharedFeed([])(call)));

    await syncEntity(db, CONFIG, ME, api);

    const deletes = calls.filter((c) => c.method === 'DELETE').map((c) => c.path).sort();
    expect(deletes).toEqual(['/api/feedings/legacy', '/api/feedings/mine']);
    const queue = await db.getAllAsync<{ payload: string }>('SELECT payload FROM sync_queue ORDER BY payload');
    expect(queue.map((q) => JSON.parse(q.payload))).toEqual([
      { contractionId: 'other-entity', userId: ME },
      { feedingId: 'theirs', userId: PARTNER },
    ]);
  });
});

describe('syncEntity legacy rows', () => {
  it('drops a legacy row the server has and uploads one it lacks, in the same sync', async () => {
    await insertLocal({ id: 'legacy-match', synced: 2, started_at: '2026-10-20T10:00:00.123Z' });
    await insertLocal({ id: 'legacy-alone', synced: 2, started_at: '2026-10-20T12:00:00.000Z' });
    // Same instant as legacy-match, with the server's microsecond digits
    mockServer(sharedFeed([serverFeeding('server-id', ME, '2026-10-20T10:00:00.123000Z')]));

    await syncEntity(db, CONFIG, ME, api);

    expect(await localIds()).toEqual(['legacy-alone', 'server-id']);
    expect((await local('legacy-alone'))?.synced).toBe(1);
    expect(calls.filter((c) => c.method === 'PUT').map((c) => c.path)).toEqual(['/api/feedings/legacy-alone']);
  });

  it('keeps the server copy when the device holds both the local and the server-id copy', async () => {
    await insertLocal({ id: 'legacy-local', synced: 2, started_at: '2026-10-20T10:00:00.000Z' });
    await insertLocal({ id: 'server-id', synced: 2, started_at: '2026-10-20T10:00:00.000Z', note: 'old' });
    mockServer(sharedFeed([serverFeeding('server-id', ME, '2026-10-20T10:00:00.000Z', { note: 'server' })]));

    await syncEntity(db, CONFIG, ME, api);

    expect(await localIds()).toEqual(['server-id']);
    expect(await local('server-id')).toMatchObject({ note: 'server', synced: 1 });
    expect(calls.filter((c) => c.method === 'PUT')).toEqual([]);
  });

  it('uploads only one of two legacy copies the server lacks', async () => {
    await insertLocal({ id: 'legacy-a', synced: 2, started_at: '2026-10-20T10:00:00.000Z' });
    await insertLocal({ id: 'legacy-b', synced: 2, started_at: '2026-10-20T10:00:00.000Z' });

    await syncEntity(db, CONFIG, ME, api);

    expect(await localIds()).toEqual(['legacy-a']);
    expect(calls.filter((c) => c.method === 'PUT').map((c) => c.path)).toEqual(['/api/feedings/legacy-a']);
  });

  it('keeps an unmatched legacy row older than a full page window', async () => {
    const base = Date.parse('2026-10-01T00:00:00.000Z');
    const page = Array.from({ length: 200 }, (_, i) =>
      serverFeeding(`s-${String(i).padStart(3, '0')}`, PARTNER, new Date(base + (200 - i) * 3_600_000).toISOString()),
    );
    await insertLocal({ id: 'legacy-inside', synced: 2, started_at: new Date(base + 10 * 3_600_000 + 1).toISOString() });
    await insertLocal({ id: 'legacy-outside', synced: 2, started_at: new Date(base - 3_600_000).toISOString() });
    mockServer(sharedFeed(page));

    await syncEntity(db, CONFIG, ME, api);

    expect((await local('legacy-inside'))?.synced).toBe(1);
    expect((await local('legacy-outside'))?.synced).toBe(2);
    expect(calls.filter((c) => c.method === 'PUT').map((c) => c.path)).toEqual(['/api/feedings/legacy-inside']);
  });

  it('leaves legacy rows untouched when the download fails', async () => {
    await insertLocal({ id: 'legacy', synced: 2 });
    mockServer(() => ({ status: 500 }));

    await syncEntity(db, CONFIG, ME, api);

    expect((await local('legacy'))?.synced).toBe(2);
    expect(calls.filter((c) => c.method === 'PUT')).toEqual([]);
  });

  it('still uploads when the download body is malformed', async () => {
    await insertLocal({ id: 'f1', synced: 0 });
    mockServer((call) => (call.method === 'GET' ? { status: 200, json: { not: 'an array' } } : undefined));

    await syncEntity(db, CONFIG, ME, api);

    expect(calls.filter((c) => c.method === 'PUT').map((c) => c.path)).toEqual(['/api/feedings/f1']);
    expect((await local('f1'))?.synced).toBe(1);
  });

  it('never throws', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('offline');
    }) as typeof fetch;
    await insertLocal({ id: 'f1', synced: 0 });

    await expect(syncEntity(db, CONFIG, ME, api)).resolves.toBeUndefined();
    expect((await local('f1'))?.synced).toBe(0);
  });
});

describe('deleteEntry', () => {
  it('tombstones and deletes an own row locally without calling the server', async () => {
    await insertLocal({ id: 'f1' });

    await deleteEntry(db, CONFIG, api, 'f1', ME);

    expect(await local('f1')).toBeNull();
    expect(calls).toEqual([]);
    const queue = await db.getAllAsync<{ payload: string }>('SELECT payload FROM sync_queue');
    expect(queue.map((q) => JSON.parse(q.payload))).toEqual([{ feedingId: 'f1', userId: ME }]);
  });

  it('deletes a partner row online and keeps it when the server refuses', async () => {
    await insertLocal({ id: 'p1', user_id: PARTNER });
    mockServer(() => ({ status: 500 }));

    await expect(deleteEntry(db, CONFIG, api, 'p1', ME)).rejects.toThrow();
    expect(await local('p1')).not.toBeNull();

    mockServer(() => ({ status: 204 }));
    await deleteEntry(db, CONFIG, api, 'p1', ME);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['DELETE /api/feedings/p1']);
    expect(await local('p1')).toBeNull();
  });

  it('deletes a partner row locally when the server no longer has it', async () => {
    await insertLocal({ id: 'p1', user_id: PARTNER });
    mockServer(() => ({ status: 404 }));

    await deleteEntry(db, CONFIG, api, 'p1', ME);

    expect(await local('p1')).toBeNull();
  });
});

describe('editPartnerEntry', () => {
  it('PUTs with create=false and stores the returned server row', async () => {
    await insertLocal({ id: 'p1', user_id: PARTNER, note: 'old' });
    const updated = serverFeeding('p1', PARTNER, '2026-10-20T09:00:00.000Z', { note: 'new' });
    mockServer(() => ({ status: 200, json: updated }));

    await editPartnerEntry(db, CONFIG, api, 'p1', { note: 'new' });

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['PUT /api/feedings/p1?create=false']);
    expect(await local('p1')).toMatchObject({ note: 'new', started_at: '2026-10-20T09:00:00.000Z', synced: 1 });
  });

  it('drops the local row and rejects on 404', async () => {
    await insertLocal({ id: 'p1', user_id: PARTNER });
    mockServer(() => ({ status: 404 }));

    await expect(editPartnerEntry(db, CONFIG, api, 'p1', {})).rejects.toThrow();
    expect(await local('p1')).toBeNull();
  });

  it('keeps the local row and rejects on other errors', async () => {
    await insertLocal({ id: 'p1', user_id: PARTNER, note: 'old' });
    mockServer(() => ({ status: 500 }));

    await expect(editPartnerEntry(db, CONFIG, api, 'p1', { note: 'new' })).rejects.toThrow();
    expect((await local('p1'))?.note).toBe('old');
  });
});

describe('createSyncRunner', () => {
  it('shares one promise between overlapping runs and starts fresh after it settles', async () => {
    const runSync = createSyncRunner();
    let release!: () => void;
    const first = jest.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const second = jest.fn(async () => {});

    const a = runSync(first);
    const b = runSync(second);
    expect(b).toBe(a);
    expect(second).not.toHaveBeenCalled();

    release();
    await a;
    await runSync(second);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('starts fresh after a rejected run', async () => {
    const runSync = createSyncRunner();
    await expect(runSync(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    const next = jest.fn(async () => {});
    await runSync(next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
