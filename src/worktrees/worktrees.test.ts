// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';

import { createWorktrees } from './worktrees';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
  return {
    repo,
    origin,
    root,
    worktrees: createWorktrees({ root, owner: '/data/this' }),
  };
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

describe('worktrees.runPrepare', () => {
  it('runs the command in the worktree and returns its output', async () => {
    const { repo, worktrees } = repository({ remote: true });
    const { path } = await worktrees.create({
      repositoryPath: repo,
      projectId: 1,
      conversationId: 1,
    });

    const result = await worktrees.runPrepare(
      path,
      'pwd -P && echo ready > prepared.txt && echo warn >&2',
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('warn');
    expect(result.output).toContain('c1');
    expect(readFileSync(join(path, 'prepared.txt'), 'utf8')).toBe('ready\n');
  });

  it('returns a non-zero exit code with the output of a failing command', async () => {
    const { repo, worktrees } = repository({ remote: true });
    const { path } = await worktrees.create({
      repositoryPath: repo,
      projectId: 1,
      conversationId: 1,
    });

    const result = await worktrees.runPrepare(path, 'echo broken >&2; exit 3');

    expect(result).toEqual({ exitCode: 3, output: 'broken' });
  });

  it('keeps the tail of very long output', async () => {
    const { repo, worktrees } = repository({ remote: true });
    const { path } = await worktrees.create({
      repositoryPath: repo,
      projectId: 1,
      conversationId: 1,
    });

    const result = await worktrees.runPrepare(
      path,
      'head -c 20000 /dev/zero | tr "\\0" a; echo; echo last-line',
    );

    expect(result.output.length).toBeLessThan(9000);
    expect(result.output).toContain('truncated');
    expect(result.output.endsWith('last-line')).toBe(true);
  });
});

describe('worktrees.state with commits', () => {
  it('reports unpushed for a commit no remote branch contains, and clean once pushed', async () => {
    const { repo, worktrees } = repository({ remote: true });
    const { path } = await worktrees.create({
      repositoryPath: repo,
      projectId: 1,
      conversationId: 1,
    });
    git(path, 'config', 'user.email', 't@example.com');
    git(path, 'config', 'user.name', 'T');
    git(path, 'switch', '-c', 'feature');
    writeFileSync(join(path, 'new.txt'), 'x');
    git(path, 'add', '.');
    git(path, 'commit', '-m', 'work');

    expect(await worktrees.state(path)).toBe('unpushed');
    git(path, 'push', 'origin', 'feature');
    expect(await worktrees.state(path)).toBe('clean');
  });

  it('reports dirty before unpushed', async () => {
    const { repo, worktrees } = repository({ remote: true });
    const { path } = await worktrees.create({
      repositoryPath: repo,
      projectId: 1,
      conversationId: 1,
    });
    git(path, 'config', 'user.email', 't@example.com');
    git(path, 'config', 'user.name', 'T');
    writeFileSync(join(path, 'new.txt'), 'x');
    git(path, 'add', '.');
    git(path, 'commit', '-m', 'work');
    writeFileSync(join(path, 'more.txt'), 'y');

    expect(await worktrees.state(path)).toBe('dirty');
  });

  it('counts a commit on a local branch as safe without a remote', async () => {
    const { repo, worktrees } = repository({ remote: false });
    const { path } = await worktrees.create({
      repositoryPath: repo,
      projectId: 1,
      conversationId: 1,
    });
    expect(await worktrees.state(path)).toBe('clean');
    git(path, 'config', 'user.email', 't@example.com');
    git(path, 'config', 'user.name', 'T');
    writeFileSync(join(path, 'new.txt'), 'x');
    git(path, 'add', '.');
    git(path, 'commit', '-m', 'work');
    expect(await worktrees.state(path)).toBe('unpushed');
    git(path, 'switch', '-c', 'feature');
    expect(await worktrees.state(path)).toBe('clean');
  });
});

describe('worktrees.remove', () => {
  it('removes a clean worktree, prunes it and leaves the branch', async () => {
    const { repo, worktrees } = repository({ remote: true });
    const { path } = await worktrees.create({
      repositoryPath: repo,
      projectId: 1,
      conversationId: 1,
    });
    git(path, 'switch', '-c', 'feature');

    await worktrees.remove(repo, path);

    expect(await worktrees.state(path)).toBe('missing');
    expect(git(repo, 'worktree', 'list', '--porcelain')).not.toContain(path);
    expect(git(repo, 'branch', '--list', 'feature')).toContain('feature');
  });

  it('refuses a dirty worktree without force and leaves it', async () => {
    const { repo, worktrees } = repository({ remote: true });
    const { path } = await worktrees.create({
      repositoryPath: repo,
      projectId: 1,
      conversationId: 1,
    });
    writeFileSync(join(path, 'untracked.txt'), 'x');

    await expect(worktrees.remove(repo, path)).rejects.toThrow(
      /untracked|modified/i,
    );
    expect(await worktrees.state(path)).toBe('dirty');
  });
});

describe('worktrees.repositoryOf', () => {
  it('finds the repository a worktree belongs to from the worktree itself', async () => {
    const { repo, worktrees } = repository({ remote: true });
    const { path } = await worktrees.create({
      repositoryPath: repo,
      projectId: 1,
      conversationId: 1,
    });

    const found = await worktrees.repositoryOf(path);

    expect(found && realpathSync(found)).toBe(realpathSync(repo));
    // It is enough to remove the worktree.
    await worktrees.remove(found as string, path);
    expect(await worktrees.state(path)).toBe('missing');
  });

  it('is null for a folder that is gone or not a worktree', async () => {
    const { worktrees } = repository({ remote: false });
    const plain = temp('plain');
    folders.push(plain);

    expect(await worktrees.repositoryOf(join(plain, 'nope'))).toBeNull();
    expect(await worktrees.repositoryOf(plain)).toBeNull();
  });
});

describe('worktrees.list', () => {
  it('lists the worktrees in the folder by project and conversation', async () => {
    const { repo, worktrees } = repository({ remote: false });
    expect(await worktrees.list()).toEqual([]);
    const a = await worktrees.create({
      repositoryPath: repo,
      projectId: 3,
      conversationId: 12,
    });

    expect(await worktrees.list()).toEqual([
      { path: a.path, projectId: 3, conversationId: 12, owned: true },
    ]);
  });

  it('marks the worktrees another data folder made, or nobody marked, as not owned', async () => {
    const { repo, root } = repository({ remote: false });
    const other = createWorktrees({ root, owner: '/data/other' });
    const theirs = await other.create({
      repositoryPath: repo,
      projectId: 3,
      conversationId: 12,
    });
    const unmarked = join(root, '3', 'c13');
    mkdirSync(unmarked, { recursive: true });

    const listed = await createWorktrees({ root, owner: '/data/this' }).list();

    expect(listed).toEqual(
      expect.arrayContaining([
        { path: theirs.path, projectId: 3, conversationId: 12, owned: false },
        { path: unmarked, projectId: 3, conversationId: 13, owned: false },
      ]),
    );
    expect(listed).toHaveLength(2);
  });

  it('knows its own worktrees however its data folder is written', async () => {
    const { repo, root, worktrees } = repository({ remote: false });
    const a = await worktrees.create({
      repositoryPath: repo,
      projectId: 3,
      conversationId: 12,
    });

    expect(
      await createWorktrees({ root, owner: '/data/this/' }).list(),
    ).toEqual([
      { path: a.path, projectId: 3, conversationId: 12, owned: true },
    ]);
  });

  it('forgets the owner once the worktree is removed', async () => {
    const { repo, worktrees } = repository({ remote: false });
    const a = await worktrees.create({
      repositoryPath: repo,
      projectId: 3,
      conversationId: 12,
    });

    await worktrees.remove(repo, a.path);
    mkdirSync(a.path);

    expect(await worktrees.list()).toEqual([
      { path: a.path, projectId: 3, conversationId: 12, owned: false },
    ]);
  });
});
