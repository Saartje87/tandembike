import type Database from 'better-sqlite3';

import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** How many backups the backups folder keeps; older ones are deleted. */
const keptBackups = 5;

type JournalEntry = { when: number; tag: string };

/**
 * The tags of the migrations Drizzle's migrator would apply, oldest first, by
 * its own rule: every journal entry whose `when` is later than the latest
 * `created_at` in `__drizzle_migrations`. No table means all are pending.
 */
function pendingMigrations(
  sqlite: Database.Database,
  migrationsFolder: string,
): string[] {
  const { entries } = JSON.parse(
    readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: JournalEntry[] };

  const hasTable = sqlite
    .prepare(
      "select 1 from sqlite_master where type = 'table' and name = '__drizzle_migrations'",
    )
    .get();
  const latest = hasTable
    ? (
        sqlite
          .prepare(
            'select created_at from __drizzle_migrations order by created_at desc limit 1',
          )
          .get() as { created_at: number | string } | undefined
      )?.created_at
    : undefined;

  return entries
    .filter((entry) => latest === undefined || Number(latest) < entry.when)
    .map((entry) => entry.tag);
}

/**
 * Before migrating the database file at `path`, writes an online backup of
 * it to `backups/` next to it, named after the time and the first pending
 * migration, and keeps only the most recent few. Does nothing when no
 * migration is pending. Throws, naming the reason, when the backup fails, so
 * the caller does not migrate (T1554).
 */
export function backUpBeforeMigrating(
  sqlite: Database.Database,
  path: string,
  migrationsFolder: string,
): void {
  const [firstPending] = pendingMigrations(sqlite, migrationsFolder);
  if (firstPending === undefined) {
    return;
  }

  const folder = join(dirname(path), 'backups');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(folder, `ticket-${stamp}-before-${firstPending}.db`);
  try {
    mkdirSync(folder, { recursive: true });
    // VACUUM INTO writes a consistent snapshot through this connection, WAL
    // included, and runs synchronously, as `migrate` does; better-sqlite3's
    // `backup()` is async.
    sqlite.prepare('vacuum into ?').run(file);
  } catch (error) {
    removePartial(file);
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not back up the database to ${folder} before applying migration ${firstPending}, so it was not migrated: ${reason}`,
      { cause: error },
    );
  }

  pruneBackups(folder);
}

function pruneBackups(folder: string): void {
  // The ISO timestamp in each name sorts oldest first.
  const backups = readdirSync(folder)
    .filter((name) => /^ticket-.*\.db$/.test(name))
    .sort();
  for (const name of backups.slice(0, -keptBackups)) {
    rmSync(join(folder, name), { force: true });
  }
}

/** Removes what a failed backup left behind, if anything. */
function removePartial(file: string): void {
  try {
    rmSync(file, { force: true });
  } catch {
    // The backup's own error is the reason worth reporting.
  }
}
