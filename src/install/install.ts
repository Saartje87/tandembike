import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const databaseFile = 'ticket.db';
const databaseFiles = [
  databaseFile,
  `${databaseFile}-wal`,
  `${databaseFile}-shm`,
];

/**
 * The folder holding the database: `TANDEMBIKE_DATA_DIR` when set (the
 * `tandembike` command sets it to `~/.tandembike`), else `data` in the
 * checkout, which `npm run dev`, `npm start` and worktree servers keep.
 */
export function dataFolder(
  env: Record<string, string | undefined>,
  checkout: string,
): string {
  return env.TANDEMBIKE_DATA_DIR || join(checkout, 'data');
}

/**
 * The files of the checkout's database to copy into a new data folder: none
 * unless the target has no database yet and the source has one, then the
 * database with any -wal and -shm files that exist.
 */
export function planFirstRunCopy(source: string, target: string): string[] {
  if (resolve(source) === resolve(target)) return [];
  if (existsSync(join(target, databaseFile))) return [];
  if (!existsSync(join(source, databaseFile))) return [];
  return databaseFiles.filter((name) => existsSync(join(source, name)));
}

/** Copies what `planFirstRunCopy` plans, never moving or overwriting. */
export function copyFirstRunDatabase(source: string, target: string): string[] {
  const files = planFirstRunCopy(source, target);
  if (files.length === 0) return files;
  mkdirSync(target, { recursive: true });
  for (const name of files) {
    // COPYFILE_EXCL: fail rather than overwrite, whatever the plan said.
    copyFileSync(join(source, name), join(target, name), 1);
  }
  return files;
}

const configName = 'config.json';

/** The first-run offers (such as `mcp`) already made, from `config.json`. */
export function offersMade(folder: string): string[] {
  try {
    const config = JSON.parse(readFileSync(join(folder, configName), 'utf8'));
    return Array.isArray(config.offersMade)
      ? config.offersMade.filter((o: unknown) => typeof o === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Records that an offer was made, so later starts stay quiet. */
export function markOffersMade(folder: string, offer: string): void {
  const made = offersMade(folder);
  if (made.includes(offer)) return;
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    join(folder, configName),
    `${JSON.stringify({ offersMade: [...made, offer] }, null, 2)}\n`,
  );
}
