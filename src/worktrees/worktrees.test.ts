// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';

import { createWorktrees } from './worktrees';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();

const temp = (name: string) => mkdtempSync(join(tmpdir(), `tb-${name}-`));

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

/** A repository on `main` with one commit, optionally with a bare origin. */
function repository({ remote }: { remote: boolean }) {
  const base = temp('repo');
  folders.push(base);
  const repo = join(base, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.email', 't@example.com');
  git(repo, 'config', 'user.name', 'T');
  writeFileSync(join(repo, 'a.txt'), 'one');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'one');
  const origin = join(base, 'origin.git');
  if (remote) {
    git(base, 'init', '--bare', '-b', 'main', origin);
    git(repo, 'remote', 'add', 'origin', origin);
    git(repo, 'push', '-u', 'origin', 'main');
  }
  const root = join(base, 'worktrees');
  return { repo, origin, root, worktrees: createWorktrees({ root }) };
}

describe('worktrees.create', () => {
  it('adds a detached worktree at the fetched origin/<default>', async () => {
    const { repo, origin, root, worktrees } = repository({ remote: true });
    // A commit lands on origin that the repository has not fetched yet.
    const other = join(temp('other'), 'clone');
    folders.push(other);
    git(tmpdir(), 'clone', origin, other);
    git(other, 'config', 'user.email', 't@example.com');
    git(other, 'config', 'user.name', 'T');
    writeFileSync(join(other, 'b.txt'), 'two');
    git(other, 'add', '.');
    git(other, 'commit', '-m', 'two');
    git(other, 'push', 'origin', 'main');

    const created = await worktrees.create({
      repositoryPath: repo,
      projectId: 3,
      conversationId: 12,
    });

    expect(created.path).toBe(join(root, '3', 'c12'));
    expect(git(created.path, 'rev-parse', 'HEAD')).toBe(
      git(other, 'rev-parse', 'HEAD'),
    );
    expect(git(created.path, 'branch', '--show-current')).toBe('');
    expect(created.base).toBe('origin/main');
  });

  it('uses the local default branch without a remote', async () => {
    const { repo, worktrees } = repository({ remote: false });

    const created = await worktrees.create({
      repositoryPath: repo,
      projectId: 1,
      conversationId: 2,
    });

    expect(git(created.path, 'rev-parse', 'HEAD')).toBe(
      git(repo, 'rev-parse', 'HEAD'),
    );
    expect(git(created.path, 'branch', '--show-current')).toBe('');
    expect(created.base).toBe('main');
  });

  it('fails with the message of git when the folder is not a repository', async () => {
    const { worktrees } = repository({ remote: false });
    const notRepo = temp('plain');
    folders.push(notRepo);

    await expect(
      worktrees.create({
        repositoryPath: notRepo,
        projectId: 1,
        conversationId: 3,
      }),
    ).rejects.toThrow(/not a git repository/i);
  });
});

describe('worktrees.state', () => {
  it('reports clean, dirty and missing', async () => {
    const { repo, worktrees } = repository({ remote: true });
    const { path } = await worktrees.create({
      repositoryPath: repo,
      projectId: 1,
      conversationId: 1,
    });

    expect(await worktrees.state(path)).toBe('clean');
    writeFileSync(join(path, 'untracked.txt'), 'x');
    expect(await worktrees.state(path)).toBe('dirty');
    rmSync(path, { recursive: true, force: true });
    expect(await worktrees.state(path)).toBe('missing');
  });
});
