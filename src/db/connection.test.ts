import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTickets } from '../tickets/tickets';
import { openDatabase } from './connection';
import * as schema from './schema';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('openDatabase', () => {
  let folder: string;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'ticket-db-'));
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it('creates a missing database file, folder included, ready to use', () => {
    const path = join(folder, 'data', 'ticket.db');

    const tickets = createTickets(openDatabase(path), 'user');

    expect(existsSync(path)).toBe(true);
    expect(tickets.listProjects()).toEqual([]);
  });

  it('keeps data when the file is opened again', () => {
    const path = join(folder, 'ticket.db');
    createTickets(openDatabase(path), 'user').createProject({
      name: 'Website',
    });

    const reopened = createTickets(openDatabase(path), 'user');

    expect(reopened.listProjects().map((project) => project.name)).toEqual([
      'Website',
    ]);
  });
});

describe('Migration 0059: the Project run count goes (T1330)', () => {
  it('drops the column and keeps each Project’s Parallel runs', () => {
    const folder = mkdtempSync(join(tmpdir(), 'ticket-migrations-'));
    const source = join(process.cwd(), 'src', 'db', 'migrations');
    cpSync(source, folder, { recursive: true });
    const journalPath = join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    const upTo = journal.entries.findIndex(
      (entry: { tag: string }) =>
        entry.tag === '0059_drop_project_max_concurrent_runs',
    );
    writeFileSync(
      journalPath,
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, upTo) }),
    );
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: folder });
    sqlite
      .prepare(
        "insert into projects (name, name_key, parallel_runs, max_concurrent_runs, created_at) values ('Website', 'website', 1, 5, 0)",
      )
      .run();

    migrate(db, { migrationsFolder: source });

    const columns = sqlite
      .prepare('pragma table_info(projects)')
      .all()
      .map((column) => (column as { name: string }).name);
    expect(columns).not.toContain('max_concurrent_runs');
    expect(
      sqlite
        .prepare("select parallel_runs from projects where name = 'Website'")
        .get(),
    ).toEqual({ parallel_runs: 1 });
    rmSync(folder, { recursive: true, force: true });
  });
});

describe('Migration 0063: Project Skills go (T1340)', () => {
  it('drops the column, keeps existing Projects and still creates new ones', () => {
    const folder = mkdtempSync(join(tmpdir(), 'ticket-migrations-'));
    const source = join(process.cwd(), 'src', 'db', 'migrations');
    cpSync(source, folder, { recursive: true });
    const journalPath = join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    const upTo = journal.entries.findIndex(
      (entry: { tag: string }) => entry.tag === '0063_drop_project_skills',
    );
    writeFileSync(
      journalPath,
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, upTo) }),
    );
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: folder });
    sqlite
      .prepare(
        `insert into projects (name, name_key, skills, created_at) values ('Website', 'website', '["/review"]', 0)`,
      )
      .run();

    migrate(db, { migrationsFolder: source });

    const columns = sqlite
      .prepare('pragma table_info(projects)')
      .all()
      .map((column) => (column as { name: string }).name);
    expect(columns).not.toContain('skills');
    const tickets = createTickets(drizzle(sqlite, { schema }), 'user');
    tickets.createProject({ name: 'Shop' });
    expect(tickets.listProjects().map((project) => project.name)).toEqual([
      'Website',
      'Shop',
    ]);
    rmSync(folder, { recursive: true, force: true });
  });
});
