// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The helper imports `playwright-core`, which lives in the driver folder a
// check copies it to, not in this repository. Importing it here must not
// launch a browser either.
const launch = vi.hoisted(() => vi.fn());
vi.mock('playwright-core', () => ({ chromium: { launch } }));

// The port is read when the module loads, so each case imports it afresh.
const importHelper = async () => {
  vi.resetModules();
  return import('./lib.mjs');
};

afterEach(() => {
  vi.unstubAllEnvs();
});

it('launches no browser on import', async () => {
  await importHelper();

  expect(launch).not.toHaveBeenCalled();
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
    const listed = [...list.matchAll(/\(([^()]*)\)/g)].flatMap(([, inside]) =>
      [...inside.matchAll(/`([A-Za-z]\w*)`/g)].map(([, name]) => name),
    );
    // Elsewhere the doc shows a helper as a call on the page, such as
    // `reply(page, 'fake:permission')`.
    const called = [...doc.matchAll(/`([A-Za-z]\w*)\(page\b/g)].map(
      ([, name]) => name,
    );
    return [...new Set([...listed, ...called])];
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

describe('savesRepositoryPath', () => {
  // A stand-in for Playwright's Request: only what the predicate reads.
  const request = ({
    method = 'POST',
    url = 'http://localhost:3100/project/3/settings',
    body = null as string | null,
  }) => ({ method: () => method, url: () => url, postData: () => body });

  it('matches the Server Action POST that carries the path', async () => {
    const { savesRepositoryPath } = await importHelper();

    const save = request({
      body: '[{"repositoryPath":"/tmp/fake-repo-a1","autoMerge":true}]',
    });

    expect(savesRepositoryPath(save, 3, '/tmp/fake-repo-a1')).toBe(true);
  });

  it('skips the polling Server Actions posted to the same page', async () => {
    const { savesRepositoryPath } = await importHelper();

    const poll = request({ body: '[3]' });

    expect(savesRepositoryPath(poll, 3, '/tmp/fake-repo-a1')).toBe(false);
  });

  it("skips another Project's Settings and other methods", async () => {
    const { savesRepositoryPath } = await importHelper();
    const body = '[{"repositoryPath":"/tmp/fake-repo-a1"}]';

    expect(
      savesRepositoryPath(
        request({ body, url: 'http://localhost:3100/project/13/settings' }),
        3,
        '/tmp/fake-repo-a1',
      ),
    ).toBe(false);
    expect(
      savesRepositoryPath(
        request({ body, method: 'GET' }),
        3,
        '/tmp/fake-repo-a1',
      ),
    ).toBe(false);
  });

  it('matches a path JSON escapes', async () => {
    const { savesRepositoryPath } = await importHelper();
    const path = '/tmp/a "quoted" \\ folder';

    const save = request({
      body: JSON.stringify([{ repositoryPath: path }]),
    });

    expect(savesRepositoryPath(save, 3, path)).toBe(true);
  });
});

describe('fakeRepository', () => {
  const made: string[] = [];

  afterEach(() => {
    for (const folder of made.splice(0)) {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  // A stand-in for Playwright's Page whose Settings form keeps what is typed
  // into it and accepts every Save: only what `setRepositoryPath` reads.
  const settingsPage = () => {
    const saved: string[] = [];
    const field = {
      fill: async (value: string) => {
        saved.push(value);
      },
      inputValue: async () => saved.at(-1),
      getAttribute: async () => null,
    };
    const button = { click: async () => {}, waitFor: async () => {} };
    const form = {
      getByLabel: () => field,
      getByRole: (role: string) =>
        role === 'alert' ? { allTextContents: async () => [] } : button,
      locator: () => ({ textContent: async () => null }),
    };
    const page = {
      goto: async () => {},
      reload: async () => {},
      waitForTimeout: async () => {},
      waitForResponse: async () => {},
      getByRole: () => form,
    };
    return { page, saved };
  };

  it('returns the path of the empty folder it set as the repository path', async () => {
    const { fakeRepository } = await importHelper();
    const { page, saved } = settingsPage();

    const folder = await fakeRepository(page, 3);
    if (folder) made.push(folder);

    expect(folder).toMatch(/^\/tmp\/fake-repo-/);
    expect(saved).toEqual([folder]);
    expect(readdirSync(folder)).toEqual([]);
  });
});
