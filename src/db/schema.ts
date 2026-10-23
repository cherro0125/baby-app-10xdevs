import * as SQLite from 'expo-sqlite';

export type AppDatabase = SQLite.SQLiteDatabase;

export async function openDatabase(): Promise<AppDatabase> {
  return SQLite.openDatabaseAsync('babytrack.db');
}

// Both data hooks call runMigrations on mount; share one run so the one-time steps never interleave.
let migrations: Promise<void> | null = null;

export function runMigrations(db: AppDatabase): Promise<void> {
  migrations ??= migrate(db).catch((e) => {
    migrations = null;
    throw e;
  });
  return migrations;
}

async function migrate(db: AppDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS contractions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_seconds INTEGER,
      strength INTEGER,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS feedings (
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

    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );
  `);

  const version = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))
    ?.user_version ?? 0;
  if (version < 1) {
    // v1: feedings used to be stored under a local id while the server assigned its own.
    // Drop synced rows so the next sync re-downloads them under their server ids.
    await db.withTransactionAsync(async () => {
      await db.execAsync('DELETE FROM feedings WHERE synced = 1; PRAGMA user_version = 1;');
    });
  }
}
