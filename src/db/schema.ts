import * as SQLite from 'expo-sqlite';

export type AppDatabase = SQLite.SQLiteDatabase;

export async function openDatabase(): Promise<AppDatabase> {
  return SQLite.openDatabaseAsync('babytrack.db');
}

export async function runMigrations(db: AppDatabase): Promise<void> {
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

    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );
  `);
}
