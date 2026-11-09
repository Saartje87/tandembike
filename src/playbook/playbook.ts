import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * The Playbook plugin's folder (ADR 0032): `playbook/` in the checkout, found
 * the way the database is, from `TANDEMBIKE_PACKAGE_DIR` or the working
 * directory.
 */
export const playbookPath = join(
  process.env.TANDEMBIKE_PACKAGE_DIR || process.cwd(),
  'playbook',
);

/** The lock file beside the Playbook's plugin folder, outside its hash. */
export const playbookLockFile = 'playbook.lock.json';

/** What the lock file records: the Playbook's version and the hash of its files. */
export type PlaybookLock = { version: string; hash: string };

const filesUnder = (folder: string): string[] =>
  readdirSync(folder).flatMap((entry) => {
    const path = join(folder, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });

/** The version in the plugin's manifest. */
export const playbookVersion = (folder = playbookPath): string =>
  JSON.parse(readFileSync(join(folder, '.claude-plugin/plugin.json'), 'utf8'))
    .version;

/**
 * A hash of every file in the Playbook folder, by relative path and content,
 * leaving out the lock file and, so the hash is the same on every machine,
 * line endings.
 */
export const hashPlaybook = (folder = playbookPath): string => {
  const hash = createHash('sha256');
  for (const file of filesUnder(folder).sort()) {
    const name = relative(folder, file).split('\\').join('/');
    if (name === playbookLockFile) {
      continue;
    }
    hash.update(`${name}\0`);
    hash.update(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
    hash.update('\0');
  }
  return hash.digest('hex');
};

/** The lock file's content for the Playbook as it is now. */
export const currentPlaybookLock = (folder = playbookPath): PlaybookLock => ({
  version: playbookVersion(folder),
  hash: hashPlaybook(folder),
});

/** The lock file as committed. */
export const readPlaybookLock = (folder = playbookPath): PlaybookLock =>
  JSON.parse(readFileSync(join(folder, playbookLockFile), 'utf8'));
