import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The files drizzle-kit writes per migration: `NNNN_<name>.sql`, its
// `meta/NNNN_snapshot.json` and its entry in `meta/_journal.json`. Parallel
// runs that each generate one collide on the number (T1162); see "Worktrees
// for parallel runs" in docs/agents/issue-tracker.md for the recipe.
export type MigrationFiles = {
  sqlFiles: string[];
  snapshotFiles: string[];
  journalTags: string[];
};

export function readMigrationFiles(folder: string): MigrationFiles {
  const meta = join(folder, 'meta');
  const journal = JSON.parse(
    readFileSync(join(meta, '_journal.json'), 'utf8'),
  ) as { entries: { tag: string }[] };

  return {
    sqlFiles: readdirSync(folder).filter((file) => file.endsWith('.sql')),
    snapshotFiles: readdirSync(meta).filter((file) =>
      file.endsWith('_snapshot.json'),
    ),
    journalTags: journal.entries.map((entry) => entry.tag),
  };
}

const numberOf = (name: string) => name.slice(0, 4);

export function findMigrationProblems({
  sqlFiles,
  snapshotFiles,
  journalTags,
}: MigrationFiles): string[] {
  const problems: string[] = [];
  const tags = sqlFiles.map((file) => file.replace(/\.sql$/, '')).sort();

  const tagsByNumber = new Map<string, string[]>();
  for (const tag of tags) {
    tagsByNumber.set(numberOf(tag), [
      ...(tagsByNumber.get(numberOf(tag)) ?? []),
      tag,
    ]);
  }

  for (const [number, sameNumber] of tagsByNumber) {
    if (sameNumber.length > 1) {
      problems.push(
        `Migration number ${number} is used twice: ${sameNumber.join(', ')}`,
      );
    }
  }

  const highest = Math.max(
    -1,
    ...[...tags, ...journalTags, ...snapshotFiles].map((name) =>
      Number(numberOf(name)),
    ),
  );
  for (let index = 0; index <= highest; index++) {
    const number = String(index).padStart(4, '0');
    if (!tagsByNumber.has(number)) {
      problems.push(`Migration number ${number} is missing`);
    }
  }

  for (const tag of tags) {
    const snapshot = `${numberOf(tag)}_snapshot.json`;
    if (!snapshotFiles.includes(snapshot)) {
      problems.push(`Migration ${tag} has no snapshot ${snapshot}`);
    }
    if (!journalTags.includes(tag)) {
      problems.push(`Migration ${tag} has no journal entry`);
    }
  }

  for (const tag of journalTags) {
    if (!tags.includes(tag)) {
      problems.push(`Journal entry ${tag} has no migration file`);
    }
  }
  for (const snapshot of snapshotFiles) {
    if (!tags.some((tag) => numberOf(tag) === numberOf(snapshot))) {
      problems.push(`Snapshot ${snapshot} has no migration file`);
    }
  }

  const ordered = journalTags.filter((tag) => tags.includes(tag));
  if (ordered.join() !== [...ordered].sort().join()) {
    problems.push('Journal entries are not in migration order');
  }

  return problems;
}
