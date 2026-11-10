import { describe, expect, it } from 'vitest';

import { findMigrationProblems, readMigrationFiles } from './migration-files';
import { join } from 'node:path';

const consistent = {
  sqlFiles: ['0000_create_projects.sql', '0001_far_wong.sql'],
  snapshotFiles: ['0000_snapshot.json', '0001_snapshot.json'],
  journalTags: ['0000_create_projects', '0001_far_wong'],
};

describe('findMigrationProblems', () => {
  it('finds none in a consistent folder', () => {
    expect(findMigrationProblems(consistent)).toEqual([]);
  });

  it('finds two migrations generated with the same number', () => {
    expect(
      findMigrationProblems({
        sqlFiles: [...consistent.sqlFiles, '0001_sturdy_rockslide.sql'],
        snapshotFiles: consistent.snapshotFiles,
        journalTags: [...consistent.journalTags, '0001_sturdy_rockslide'],
      }),
    ).toContain(
      'Migration number 0001 is used twice: 0001_far_wong, 0001_sturdy_rockslide',
    );
  });

  it('finds a gap in the numbers', () => {
    expect(
      findMigrationProblems({
        sqlFiles: ['0000_create_projects.sql', '0002_far_wong.sql'],
        snapshotFiles: ['0000_snapshot.json', '0002_snapshot.json'],
        journalTags: ['0000_create_projects', '0002_far_wong'],
      }),
    ).toEqual(['Migration number 0001 is missing']);
  });

  it('finds a migration without its snapshot', () => {
    expect(
      findMigrationProblems({
        ...consistent,
        snapshotFiles: ['0000_snapshot.json'],
      }),
    ).toEqual(['Migration 0001_far_wong has no snapshot 0001_snapshot.json']);
  });

  it('finds a migration without its journal entry', () => {
    expect(
      findMigrationProblems({
        ...consistent,
        journalTags: ['0000_create_projects'],
      }),
    ).toEqual(['Migration 0001_far_wong has no journal entry']);
  });

  it('finds a journal entry or snapshot without its migration', () => {
    expect(
      findMigrationProblems({
        sqlFiles: ['0000_create_projects.sql'],
        snapshotFiles: consistent.snapshotFiles,
        journalTags: consistent.journalTags,
      }),
    ).toEqual([
      'Migration number 0001 is missing',
      'Journal entry 0001_far_wong has no migration file',
      'Snapshot 0001_snapshot.json has no migration file',
    ]);
  });

  it('finds journal entries out of order', () => {
    expect(
      findMigrationProblems({
        ...consistent,
        journalTags: ['0001_far_wong', '0000_create_projects'],
      }),
    ).toEqual(['Journal entries are not in migration order']);
  });
});

describe('the migrations folder', () => {
  it('has unique, gapless numbers, each with its snapshot and journal entry', () => {
    const folder = join(__dirname, 'migrations');

    expect(findMigrationProblems(readMigrationFiles(folder))).toEqual([]);
  });
});
