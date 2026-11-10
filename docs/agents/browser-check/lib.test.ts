// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The helper imports `playwright-core`, which lives in the driver folder a
// check copies it to, not in this repository. Importing it here must not
// launch a browser either.
vi.mock('playwright-core', () => ({ chromium: { launch: vi.fn() } }));

// The port is read when the module loads, so each case imports it afresh.
const importHelper = async () => {
  vi.resetModules();
  return import('./lib.mjs');
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('base', () => {
  it('is localhost:3100 when BROWSER_CHECK_PORT is unset', async () => {
    vi.stubEnv('BROWSER_CHECK_PORT', undefined);

    const { base, port } = await importHelper();

    expect(port).toBe(3100);
    expect(base).toBe('http://localhost:3100');
  });

  it('uses the port BROWSER_CHECK_PORT gives', async () => {
    vi.stubEnv('BROWSER_CHECK_PORT', '3107');

    const { base, port } = await importHelper();

    expect(port).toBe(3107);
    expect(base).toBe('http://localhost:3107');
  });
});

describe('throwawayRepository', () => {
  const made: string[] = [];

  afterEach(() => {
    for (const folder of made.splice(0)) {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  const git = (folder: string, ...args: string[]) =>
    execFileSync('git', args, { cwd: folder, encoding: 'utf8' }).trim();

  it('makes a git repository with one commit on main', async () => {
    const { throwawayRepository } = await importHelper();

    const folder = await throwawayRepository();
    made.push(folder);

    expect(git(folder, 'rev-parse', '--show-toplevel')).toBe(
      realpathSync(folder),
    );
    expect(git(folder, 'branch', '--show-current')).toBe('main');
    expect(git(folder, 'rev-list', '--count', 'HEAD')).toBe('1');
    expect(git(folder, 'status', '--porcelain')).toBe('');
  });

  it('makes a new folder on every call', async () => {
    const { throwawayRepository } = await importHelper();

    const first = await throwawayRepository();
    const second = await throwawayRepository();
    made.push(first, second);

    expect(first).not.toBe(second);
  });
});

describe('the helpers browser-checks.md names', () => {
  // Recipe step 5 lists each helper in parentheses after what it does:
  // "launches the installed Chrome headless (`launch`), calls MCP tools
  // (`call`), …". Read the names from there, so a helper the doc names but
  // the module no longer exports fails here.
  const namedHelpers = () => {
    const doc = readFileSync(
      fileURLToPath(new URL('../browser-checks.md', import.meta.url)),
      'utf8',
    );
    const marker = 'The helper [`browser-check/lib.mjs`]';
    const start = doc.indexOf(marker);
    if (start === -1) throw new Error('browser-checks.md lists no helpers');
    const list = doc.slice(start + marker.length).split('\n')[0];
    return [...list.matchAll(/\(([^()]*)\)/g)].flatMap(([, inside]) =>
      [...inside.matchAll(/`([A-Za-z]\w*)`/g)].map(([, name]) => name),
    );
  };

  it('finds the helper list in the doc', () => {
    expect(namedHelpers()).toEqual(
      expect.arrayContaining(['launch', 'call', 'freshProject', 'press']),
    );
  });

  it('are each exported from lib.mjs', async () => {
    const helper = await importHelper();

    const missing = namedHelpers().filter((name) => !(name in helper));

    expect(missing).toEqual([]);
  });
});
