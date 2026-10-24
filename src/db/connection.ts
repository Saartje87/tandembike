import Database from 'better-sqlite3';
import {
  type BetterSQLite3Database,
  drizzle,
} from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import * as schema from './schema';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type DatabaseConnection = BetterSQLite3Database<typeof schema>;

/** Where the app keeps its data: a git-ignored folder at the repo root. */
export const appDatabasePath = join(process.cwd(), 'data', 'ticket.db');

const migrationsFolder = join(process.cwd(), 'src', 'db', 'migrations');

/**
 * Opens a SQLite database and applies any pending migrations. Pass a file
 * path (created, with its folder, if missing) or `':memory:'` for a
 * throwaway database.
 */
export function openDatabase(path: string): DatabaseConnection {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }

  const sqlite = new Database(path);
  sqlite.pragma('foreign_keys = ON');
  if (path !== ':memory:') {
    sqlite.pragma('journal_mode = WAL');
  }

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return db;
}
