import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Resolve tsx the way Node does, so a worktree without its own node_modules
// finds the main checkout's install (T1224).
const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');

// A home, data folder and checkout of its own for every run, so no test
// reads the User's ~/.tandembike or starts a server from a real build: the
// temp checkout has none.
let sandbox: string;
beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'tandembike-cli-sandbox-'));
});
afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

// Runs the CLI from source in this checkout. Node runs tsx directly, so PATH
// can leave out `claude` (and node).
const runCli = (args: string[], env: Record<string, string> = {}) =>
  spawnSync(
    process.execPath,
    [tsxCli, join('src', 'install', 'cli.ts'), ...args],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      input: '',
      env: {
        NODE_ENV: 'test',
        PATH: '/usr/bin:/bin',
        HOME: sandbox,
        TANDEMBIKE_DATA_DIR: join(sandbox, '.tandembike'),
        TANDEMBIKE_PACKAGE_DIR: join(sandbox, 'checkout'),
        ...env,
      },
    },
  );

// Runs the real command the way bin/tandembike.mjs does, so a module-format
// error (such as top-level await under tsx's CommonJS output) fails here.
describe('tandembike mcp', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'tandembike-cli-'));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('prints the registration command when not run in a terminal', () => {
    const result = runCli(['mcp'], {
      HOME: home,
      TANDEMBIKE_DATA_DIR: join(home, '.tandembike'),
      TANDEMBIKE_PACKAGE_DIR: join(home, 'checkout'),
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'claude mcp add --scope user --transport http tandembike',
    );
  }, 30_000);
});

describe('tandembike help and status (T1350)', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'tandembike-cli-'));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('prints the help and exits 0 for a bare tandembike without a terminal', () => {
    const result = runCli([]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('tandembike start');
    expect(result.stdout).toContain('tandembike stop');
  }, 30_000);

  it('exits 1 from status with nothing running', () => {
    const result = runCli(['status'], {
      HOME: home,
      TANDEMBIKE_DATA_DIR: join(home, '.tandembike'),
      TANDEMBIKE_URL: 'http://127.0.0.1:1',
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Tandembike is not running.');
  }, 30_000);

  it('refuses start with no production build, exit 1', () => {
    const result = runCli(['start'], {
      HOME: home,
      TANDEMBIKE_DATA_DIR: join(home, '.tandembike'),
      TANDEMBIKE_PACKAGE_DIR: join(home, 'checkout'),
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('run `npm run build` first');
  }, 30_000);
});

describe('session commands with the server down (T1354)', () => {
  it.each([[['implement', '42']], [['resume', '3']]])(
    '%j exits 1 with the log path and the tandembike start hint when the automatic start fails',
    (argv) => {
      const result = runCli(argv, { TANDEMBIKE_URL: 'http://127.0.0.1:1' });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('run `npm run build` first');
      expect(result.stdout).toContain(
        `Logs: ${join(sandbox, '.tandembike', 'server.log')}`,
      );
      expect(result.stdout).toContain('`tandembike start`');
    },
    30_000,
  );
});

describe('tandembike resume (T1241)', () => {
  it('prints the usage and exits 1 for a resume without a Conversation', () => {
    const result = runCli(['resume']);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('tandembike resume <conversation>');
  }, 30_000);
});
