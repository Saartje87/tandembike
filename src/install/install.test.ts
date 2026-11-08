// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  copyFirstRunDatabase,
  dataFolder,
  markOffersMade,
  offersMade,
  planFirstRunCopy,
} from './install';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('dataFolder', () => {
  it('is the checkout data folder when nothing is set', () => {
    expect(dataFolder({}, '/code/tandembike')).toBe('/code/tandembike/data');
  });

  it('is TANDEMBIKE_DATA_DIR when set', () => {
    expect(
      dataFolder({ TANDEMBIKE_DATA_DIR: '/home/me/.tandembike' }, '/code/t'),
    ).toBe('/home/me/.tandembike');
  });

  it('ignores an empty TANDEMBIKE_DATA_DIR', () => {
    expect(dataFolder({ TANDEMBIKE_DATA_DIR: '' }, '/code/t')).toBe(
      '/code/t/data',
    );
  });
});

describe('first-run copy', () => {
  let root: string;
  let source: string;
  let target: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'tandembike-install-'));
    source = join(root, 'checkout', 'data');
    target = join(root, 'home', '.tandembike');
    mkdirSync(source, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('plans nothing when the checkout has no database', () => {
    expect(planFirstRunCopy(source, target)).toEqual([]);
  });

  it('plans the database with its -wal and -shm files', () => {
    for (const name of ['ticket.db', 'ticket.db-wal', 'ticket.db-shm']) {
      writeFileSync(join(source, name), name);
    }

    expect(planFirstRunCopy(source, target)).toEqual([
      'ticket.db',
      'ticket.db-wal',
      'ticket.db-shm',
    ]);
  });

  it('skips a -wal file that does not exist', () => {
    writeFileSync(join(source, 'ticket.db'), 'db');

    expect(planFirstRunCopy(source, target)).toEqual(['ticket.db']);
  });

  it('plans nothing when the target already has a database', () => {
    writeFileSync(join(source, 'ticket.db'), 'old');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'ticket.db'), 'mine');

    expect(planFirstRunCopy(source, target)).toEqual([]);
  });

  it('plans nothing when source and target are the same folder', () => {
    writeFileSync(join(source, 'ticket.db'), 'db');

    expect(planFirstRunCopy(source, source)).toEqual([]);
  });

  it('copies the files, creating the folder, and keeps the originals', () => {
    writeFileSync(join(source, 'ticket.db'), 'db');
    writeFileSync(join(source, 'ticket.db-wal'), 'wal');

    const copied = copyFirstRunDatabase(source, target);

    expect(copied).toEqual(['ticket.db', 'ticket.db-wal']);
    expect(readFileSync(join(target, 'ticket.db'), 'utf8')).toBe('db');
    expect(readFileSync(join(target, 'ticket.db-wal'), 'utf8')).toBe('wal');
    expect(existsSync(join(source, 'ticket.db'))).toBe(true);
  });

  it('never overwrites an existing database', () => {
    writeFileSync(join(source, 'ticket.db'), 'old');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'ticket.db'), 'mine');

    expect(copyFirstRunDatabase(source, target)).toEqual([]);
    expect(readFileSync(join(target, 'ticket.db'), 'utf8')).toBe('mine');
  });
});

describe('offers made', () => {
  let folder: string;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'tandembike-config-'));
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it('are not made before anything is recorded', () => {
    expect(offersMade(folder)).toEqual([]);
  });

  it('are remembered in config.json, once each', () => {
    markOffersMade(folder, 'mcp');
    markOffersMade(folder, 'mcp');
    markOffersMade(folder, 'plugin');

    expect(offersMade(folder)).toEqual(['mcp', 'plugin']);
    expect(
      JSON.parse(readFileSync(join(folder, 'config.json'), 'utf8')),
    ).toEqual({ offersMade: ['mcp', 'plugin'] });
  });

  it('are empty when config.json is unreadable', () => {
    writeFileSync(join(folder, 'config.json'), 'not json');

    expect(offersMade(folder)).toEqual([]);
  });
});
