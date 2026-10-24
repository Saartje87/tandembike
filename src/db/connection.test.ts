// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTickets } from '../tickets/tickets';
import { openDatabase } from './connection';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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

    const tickets = createTickets(openDatabase(path));

    expect(existsSync(path)).toBe(true);
    expect(tickets.listProjects()).toEqual([]);
  });

  it('keeps data when the file is opened again', () => {
    const path = join(folder, 'ticket.db');
    createTickets(openDatabase(path)).createProject({ name: 'Website' });

    const reopened = createTickets(openDatabase(path));

    expect(reopened.listProjects().map((project) => project.name)).toEqual([
      'Website',
    ]);
  });
});
