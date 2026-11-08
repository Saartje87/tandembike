// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
    const checkout = process.cwd();
    // Node runs tsx directly, so PATH can leave out `claude` (and node).
    const result = spawnSync(
      process.execPath,
      [
        join(checkout, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
        join('src', 'install', 'cli.ts'),
        'mcp',
      ],
      {
        cwd: checkout,
        encoding: 'utf8',
        input: '',
        env: {
          NODE_ENV: 'test',
          PATH: '/usr/bin:/bin',
          HOME: home,
          TANDEMBIKE_DATA_DIR: join(home, '.tandembike'),
          TANDEMBIKE_PACKAGE_DIR: join(home, 'checkout'),
        },
      },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'claude mcp add --scope user --transport http tandembike',
    );
  }, 30_000);
});
