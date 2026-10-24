// Node types are scoped to this file; app code must not see Node globals.
/// <reference types="node" />
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import type { SyncDb } from '@/sync/entity-sync';

type Params = unknown[];

// expo-sqlite accepts either one params array or variadic params
function bind(params: Params): SQLInputValue[] {
  const values = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
  return values as SQLInputValue[];
}

/** The expo-sqlite subset the sync engine uses, on an in-memory node:sqlite database. */
export class NodeSqliteDb implements SyncDb {
  readonly db = new DatabaseSync(':memory:');

  async runAsync(source: string, ...params: Params) {
    const result = this.db.prepare(source).run(...bind(params));
    return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
  }

  async getAllAsync<T>(source: string, ...params: Params): Promise<T[]> {
    return this.db.prepare(source).all(...bind(params)) as T[];
  }

  async getFirstAsync<T>(source: string, ...params: Params): Promise<T | null> {
    return (this.db.prepare(source).get(...bind(params)) as T | undefined) ?? null;
  }

  async execAsync(source: string): Promise<void> {
    this.db.exec(source);
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.db.exec('BEGIN');
    try {
      await task();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
}
