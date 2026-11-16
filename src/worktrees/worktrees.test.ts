import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { createWorktrees } from './worktrees';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
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

/**
 * A repository on `main` with one commit, optionally with a bare origin,
 * built once with `git` and then copied into each test's own folder: a copy
 * is much faster than the eight `git` runs that build it.
 */
const templates = new Map<boolean, string>();
function template(remote: boolean) {
  let base = templates.get(remote);
  if (base) return base;
  base = temp('template');
  const repo = join(base, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.email', 't@example.com');
  git(repo, 'config', 'user.name', 'T');
  writeFileSync(join(repo, 'a.txt'), 'one');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'one');
  if (remote) {
    const origin = join(base, 'origin.git');
    git(base, 'init', '--bare', '-b', 'main', origin);
    git(repo, 'remote', 'add', 'origin', origin);
    git(repo, 'push', '-u', 'origin', 'main');
  }
  templates.set(remote, base);
  return base;
}
afterAll(() => {
  for (const base of templates.values()) {
    rmSync(base, { recursive: true, force: true });
  }
});

function repository({ remote }: { remote: boolean }) {
  const base = temp('repo');
  folders.push(base);
  cpSync(template(remote), base, { recursive: true });
  const repo = join(base, 'repo');
  const origin = join(base, 'origin.git');
  // The copy's remote still names the template's origin.
  if (remote) git(repo, 'remote', 'set-url', 'origin', origin);
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

/** Makes local branch `name` with one commit of its own, committed at `date`. */
function branchAt(repo: string, name: string, date = '2026-01-01T00:00:00Z') {
  git(repo, 'branch', name, 'main');
  const tree = git(repo, 'rev-parse', 'main^{tree}');
  const commit = execFileSync(
    'git',
    ['commit-tree', tree, '-p', 'main', '-m', name],
    {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'T',
        GIT_AUTHOR_EMAIL: 't@example.com',
        GIT_COMMITTER_NAME: 'T',
        GIT_COMMITTER_EMAIL: 't@example.com',
        GIT_COMMITTER_DATE: date,
      },
    },
  ).trim();
  git(repo, 'update-ref', `refs/heads/${name}`, commit);
  return commit;
}

describe("worktrees.create on a Ticket's branch", () => {
  const ticket = { ticketNumber: 42, title: 'Fix the Board: drag & drop!' };

  it('creates ticket-<n>-<slug> from origin/<default>, not detached and not tracking it', async () => {
    const { repo, worktrees } = repository({ remote: true });

    const created = await worktrees.create({
      repositoryPath: repo,
      projectId: 3,
      conversationId: 12,
      branch: ticket,
    });

    expect(git(created.path, 'branch', '--show-current')).toBe(
      'ticket-42-fix-the-board-drag-drop',
    );
    expect(created.base).toBe('origin/main');
    expect(created.branch).toBe('ticket-42-fix-the-board-drag-drop');
    expect(git(created.path, 'rev-parse', 'HEAD')).toBe(
      git(repo, 'rev-parse', 'origin/main'),
    );
    expect(
      git(
        repo,
        'config',
        '--default',
        'none',
        '--get',
        'branch.ticket-42-fix-the-board-drag-drop.merge',
      ),
    ).toBe('none');
  });

  it('creates it from the local default branch without a remote', async () => {
    const { repo, worktrees } = repository({ remote: false });

    const created = await worktrees.create({
      repositoryPath: repo,
      projectId: 3,
      conversationId: 12,
      branch: ticket,
    });

    expect(git(created.path, 'branch', '--show-current')).toBe(
      'ticket-42-fix-the-board-drag-drop',
    );
    expect(created.base).toBe('main');
  });

  it('caps the slug in length, without a trailing hyphen', async () => {
    const { repo, worktrees } = repository({ remote: false });

    const created = await worktrees.create({
      repositoryPath: repo,
      projectId: 3,
      conversationId: 12,
      branch: {
        ticketNumber: 7,
        title: `${'word '.repeat(30)}end`,
      },
    });

    const name = git(created.path, 'branch', '--show-current');
    expect(name.startsWith('ticket-7-word-word')).toBe(true);
    expect(name.length).toBeLessThanOrEqual('ticket-7-'.length + 40);
    expect(name.endsWith('-')).toBe(false);
  });

  it('reuses an existing ticket-<n>-* branch whose slug differs', async () => {
    const { repo, worktrees } = repository({ remote: false });
    const commit = branchAt(repo, 'ticket-42-old-title');

    const created = await worktrees.create({
      repositoryPath: repo,
      projectId: 3,
      conversationId: 12,
      branch: ticket,
    });

    expect(git(created.path, 'branch', '--show-current')).toBe(
      'ticket-42-old-title',
    );
    expect(git(created.path, 'rev-parse', 'HEAD')).toBe(commit);
    expect(created.branch).toBe('ticket-42-old-title');
  });

  it('reuses an old t<n>-* branch when there is no ticket-<n>-* one', async () => {
    const { repo, worktrees } = repository({ remote: false });
    branchAt(repo, 't42-playbook-name');

    const created = await worktrees.create({
      repositoryPath: repo,
      projectId: 3,
      conversationId: 12,
      branch: ticket,
    });

    expect(git(created.path, 'branch', '--show-current')).toBe(
      't42-playbook-name',
    );
  });

  it('prefers ticket-<n>-* over a newer t<n>-* branch', async () => {
    const { repo, worktrees } = repository({ remote: false });
    branchAt(repo, 'ticket-42-a', '2026-01-01T00:00:00Z');
    branchAt(repo, 't42-b', '2026-06-01T00:00:00Z');

    const created = await worktrees.create({
      repositoryPath: repo,
      projectId: 3,
      conversationId: 12,
      branch: ticket,
    });

    expect(git(created.path, 'branch', '--show-current')).toBe('ticket-42-a');
  });

  it('takes the most recently committed of several matching branches', async () => {
    const { repo, worktrees } = repository({ remote: false });
    branchAt(repo, 'ticket-42-a', '2026-01-01T00:00:00Z');
    branchAt(repo, 'ticket-42-b', '2026-06-01T00:00:00Z');
    branchAt(repo, 'ticket-42-c', '2026-03-01T00:00:00Z');

    const created = await worktrees.create({
      repositoryPath: repo,
      projectId: 3,
      conversationId: 12,
      branch: ticket,
    });

    expect(git(created.path, 'branch', '--show-current')).toBe('ticket-42-b');
  });

  it('never picks up the branch of a longer number', async () => {
    const { repo, worktrees } = repository({ remote: false });
    branchAt(repo, 'ticket-420-other');
    branchAt(repo, 't420-other');

    const created = await worktrees.create({
      repositoryPath: repo,
      projectId: 3,
      conversationId: 12,
      branch: ticket,
    });

    expect(git(created.path, 'branch', '--show-current')).toBe(
      'ticket-42-fix-the-board-drag-drop',
    );
  });

  it('refuses a branch checked out in another worktree, naming it', async () => {
    const { repo, worktrees } = repository({ remote: false });
    branchAt(repo, 'ticket-42-busy');
    const elsewhere = join(temp('elsewhere'), 'tree');
    folders.push(elsewhere);
    git(repo, 'worktree', 'add', elsewhere, 'ticket-42-busy');

    await expect(
      worktrees.create({
        repositoryPath: repo,
        projectId: 3,
        conversationId: 12,
        branch: ticket,
      }),
    ).rejects.toThrow(
      new RegExp(`ticket-42-busy.*checked out.*${realpathSync(elsewhere)}`),
    );
  });

  it('refuses the branch checked out in the main checkout', async () => {
    const { repo, worktrees } = repository({ remote: false });
    branchAt(repo, 'ticket-42-here');
    git(repo, 'switch', 'ticket-42-here');

    await expect(
      worktrees.create({
        repositoryPath: repo,
        projectId: 3,
        conversationId: 12,
        branch: ticket,
      }),
    ).rejects.toThrow(/ticket-42-here.*checked out/);
  });

  it('keeps the branch when the worktree is removed', async () => {
    const { repo, worktrees } = repository({ remote: false });
    const created = await worktrees.create({
      repositoryPath: repo,
      projectId: 3,
      conversationId: 12,
      branch: ticket,
    });

    await worktrees.remove(repo, created.path);

    expect(git(repo, 'branch', '--list', created.branch as string)).toContain(
      created.branch,
    );
  });

  it('refuses a repository with no commits, saying to make a first commit', async () => {
    const { worktrees } = repository({ remote: false });
    const empty = temp('empty');
    folders.push(empty);
    git(empty, 'init', '-b', 'main');

    await expect(
      worktrees.create({
        repositoryPath: empty,
        projectId: 3,
        conversationId: 12,
        branch: ticket,
      }),
    ).rejects.toThrow(/make a first commit/i);
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

  it("runs the command without the server's NODE_ENV and with the rest of its environment", async () => {
    const { repo, worktrees } = repository({ remote: true });
    const { path } = await worktrees.create({
      repositoryPath: repo,
      projectId: 1,
      conversationId: 1,
    });
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TANDEMBIKE_PREPARE_PROBE', 'kept');

    try {
      const result = await worktrees.runPrepare(
        path,
        'printenv NODE_ENV || echo "node=unset"; echo "probe=$TANDEMBIKE_PREPARE_PROBE home=$HOME"',
      );

      expect(result.output).toBe(
        `node=unset\nprobe=kept home=${process.env.HOME}`,
      );
    } finally {
      vi.unstubAllEnvs();
    }
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
