// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';

import { detectRepository } from './detect-repository';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const folders: string[] = [];

function folder(): string {
  const path = realpathSync(mkdtempSync(join(tmpdir(), 'detect-')));
  folders.push(path);
  return path;
}

function git(cwd: string, ...args: string[]) {
  execFileSync(
    'git',
    ['-c', 'user.name=T', '-c', 'user.email=t@example.com', ...args],
    { cwd, stdio: 'pipe' },
  );
}

function repository(branch = 'main'): string {
  const path = folder();
  git(path, 'init', '-b', branch);
  return path;
}

function found(path: string) {
  const result = detectRepository(path);
  if (!result.ok) {
    throw new Error(`Expected a repository, got ${result.reason}.`);
  }
  return result;
}

afterEach(() => {
  for (const path of folders.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('detectRepository', () => {
  it('refuses a relative path, a missing path, a file and a plain folder', () => {
    const file = join(folder(), 'file.txt');
    writeFileSync(file, 'x');

    expect(detectRepository('relative/path')).toMatchObject({
      ok: false,
      reason: 'not-absolute',
    });
    expect(detectRepository('/no/such/dir-xyz')).toMatchObject({
      ok: false,
      reason: 'not-a-directory',
    });
    expect(detectRepository(file)).toMatchObject({
      ok: false,
      reason: 'not-a-directory',
    });
    expect(detectRepository(folder())).toMatchObject({
      ok: false,
      reason: 'not-a-repository',
    });
  });

  it('reports the current branch as the default when there is no origin', () => {
    expect(found(repository('trunk'))).toMatchObject({
      defaultBranch: 'trunk',
      remote: null,
      referenceTemplate: null,
    });
  });

  it('reports origin/HEAD as the default branch and the origin remote', () => {
    const bare = folder();
    git(bare, 'init', '--bare', '-b', 'develop');
    const source = repository('develop');
    writeFileSync(join(source, 'a.txt'), 'a');
    git(source, 'add', '.');
    git(source, 'commit', '-m', 'first');
    git(source, 'remote', 'add', 'origin', bare);
    git(source, 'push', 'origin', 'develop');
    const clone = join(folder(), 'clone');
    git(folder(), 'clone', bare, clone);
    git(clone, 'checkout', '-b', 'feature');

    expect(found(clone)).toMatchObject({
      defaultBranch: 'develop',
      remote: bare,
      referenceTemplate: null,
    });
  });

  it('suggests an issues template for GitHub remotes in each URL form', () => {
    for (const url of [
      'https://github.com/acme/site.git',
      'git@github.com:acme/site.git',
      'ssh://git@github.com/acme/site',
    ]) {
      const path = repository();
      git(path, 'remote', 'add', 'origin', url);

      expect(found(path)).toMatchObject({
        remote: url,
        referenceTemplate: {
          prefix: '#',
          url: 'https://github.com/acme/site/issues/{n}',
        },
      });
    }
  });

  it('suggests no template for another host', () => {
    const path = repository();
    git(path, 'remote', 'add', 'origin', 'https://gitlab.com/acme/site.git');

    expect(found(path)).toMatchObject({
      remote: 'https://gitlab.com/acme/site.git',
      referenceTemplate: null,
    });
  });

  it('follows a worktree to the repository it belongs to', () => {
    const path = repository('main');
    writeFileSync(join(path, 'a.txt'), 'a');
    git(path, 'add', '.');
    git(path, 'commit', '-m', 'first');
    git(path, 'remote', 'add', 'origin', 'git@github.com:acme/site.git');
    const tree = join(folder(), 'tree');
    git(path, 'worktree', 'add', '-b', 'topic', tree);

    expect(found(tree)).toMatchObject({
      defaultBranch: 'main',
      remote: 'git@github.com:acme/site.git',
    });
  });

  describe('Check command candidates', () => {
    function candidates(files: Record<string, string>): string[] {
      const path = repository();
      for (const [name, content] of Object.entries(files)) {
        writeFileSync(join(path, name), content);
      }
      return found(path).checkCommands;
    }

    it('are empty without any source', () => {
      expect(candidates({})).toEqual([]);
    });

    it('prefer a check script over a test script', () => {
      expect(
        candidates({
          'package.json': JSON.stringify({
            scripts: { test: 'vitest', check: 'biome check' },
          }),
        }),
      ).toEqual(['npm run check']);
      expect(
        candidates({
          'package.json': JSON.stringify({ scripts: { test: 'vitest' } }),
        }),
      ).toEqual(['npm test']);
    });

    it('pick the package manager by lockfile', () => {
      const pkg = JSON.stringify({ scripts: { check: 'x', test: 'y' } });
      expect(candidates({ 'package.json': pkg, 'pnpm-lock.yaml': '' })).toEqual(
        ['pnpm run check'],
      );
      expect(candidates({ 'package.json': pkg, 'yarn.lock': '' })).toEqual([
        'yarn run check',
      ]);
      expect(candidates({ 'package.json': pkg, 'bun.lock': '' })).toEqual([
        'bun run check',
      ]);
      expect(
        candidates({
          'package.json': JSON.stringify({ scripts: { test: 'y' } }),
          'pnpm-lock.yaml': '',
        }),
      ).toEqual(['pnpm test']);
    });

    it('ignore a package.json that is not valid JSON', () => {
      expect(candidates({ 'package.json': '{' })).toEqual([]);
    });

    it('find make targets, check before test', () => {
      expect(
        candidates({ Makefile: 'test:\n\tgo x\ncheck: test\n\techo' }),
      ).toEqual(['make check', 'make test']);
      expect(candidates({ Makefile: 'build:\n\techo' })).toEqual([]);
    });

    it('come out in the order npm, make, cargo, go, pytest', () => {
      expect(
        candidates({
          'pyproject.toml': '[tool.pytest.ini_options]',
          'go.mod': 'module x',
          'Cargo.toml': '[package]',
          Makefile: 'check:\n\techo',
          'package.json': JSON.stringify({ scripts: { test: 'y' } }),
        }),
      ).toEqual([
        'npm test',
        'make check',
        'cargo test',
        'go test ./...',
        'pytest',
      ]);
    });

    it('skip pytest when pyproject.toml does not mention it', () => {
      expect(candidates({ 'pyproject.toml': '[project]' })).toEqual([]);
    });
  });

  it('runs no git command', () => {
    const source = repository();
    mkdirSync(join(source, 'x'));
    // A PATH without git would make any spawned `git` fail.
    const { PATH } = process.env;
    process.env.PATH = '';
    try {
      expect(detectRepository(source).ok).toBe(true);
    } finally {
      process.env.PATH = PATH;
    }
  });
});
