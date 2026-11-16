import Database from 'better-sqlite3';
import {
  type BetterSQLite3Database,
  drizzle,
} from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { dataFolder } from './data-folder';
import { backUpBeforeMigrating } from './migration-backup';
import * as schema from './schema';
import { existsSync, mkdirSync } from 'node:fs';
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
export const appDataFolder = dataFolder(process.env, packageFolder);

/** The app's database file, in its data folder. */
export const appDatabasePath = join(appDataFolder, 'ticket.db');

const appMigrationsFolder = join(packageFolder, 'src', 'db', 'migrations');

type OpenDatabaseOptions = {
  /** The Drizzle migrations to apply; the app's own by default. */
  migrationsFolder?: string;
};

/**
 * Opens a SQLite database and applies any pending migrations. Pass a file
 * path (created, with its folder, if missing) or `':memory:'` for a
 * throwaway database. Before migrating an existing file, it writes a backup
 * to `backups/` next to it and throws instead of migrating if that fails.
 */
export function openDatabase(
  path: string,
  { migrationsFolder = appMigrationsFolder }: OpenDatabaseOptions = {},
): DatabaseConnection {
  const isFile = path !== ':memory:';
  const existed = isFile && existsSync(path);
  if (isFile) {
    mkdirSync(dirname(path), { recursive: true });
  }

  const sqlite = new Database(path);
  sqlite.pragma('foreign_keys = ON');
  if (isFile) {
    sqlite.pragma('journal_mode = WAL');
  }

  // A database file created just now holds nothing to lose.
  if (existed) {
    try {
      backUpBeforeMigrating(sqlite, path, migrationsFolder);
    } catch (error) {
      sqlite.close();
      throw error;
    }
  }

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return db;
}
