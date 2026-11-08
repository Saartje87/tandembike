import Database from 'better-sqlite3';
import {
  type BetterSQLite3Database,
  drizzle,
} from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { dataFolder } from './data-folder';
import * as schema from './schema';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type DatabaseConnection = BetterSQLite3Database<typeof schema>;

/**
 * The package's own folder: the checkout. The `tandembike` command sets
 * `TANDEMBIKE_PACKAGE_DIR`; `npm run dev` and `npm start` run from the
 * checkout, so the working directory is it.
 */
const packageFolder = process.env.TANDEMBIKE_PACKAGE_DIR || process.cwd();

/**
 * Where the app keeps its data: `TANDEMBIKE_DATA_DIR` (`~/.tandembike` for the
 * command), else the git-ignored `data` folder in the checkout.
 */
export const appDatabasePath = join(
  dataFolder(process.env, packageFolder),
  'ticket.db',
);

const migrationsFolder = join(packageFolder, 'src', 'db', 'migrations');

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
