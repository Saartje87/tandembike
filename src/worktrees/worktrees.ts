import { detectRepository } from '../repository/detect-repository';
import { runEnvironment } from './run-environment';
import { execFile } from 'node:child_process';
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * What a worktree holds, for deciding whether it is safe to remove or
 * resume in: `dirty` with uncommitted or untracked changes, `unpushed` with
 * commits on HEAD that no remote branch contains (no branch at all without a
 * remote), `missing` when the folder is gone.
 */
export type WorktreeState = 'clean' | 'dirty' | 'unpushed' | 'missing';

/** Why a worktree is kept rather than removed. */
export type KeptWorktreeState = Exclude<WorktreeState, 'clean' | 'missing'>;

export type CreatedWorktree = {
  path: string;
  /**
   * What it starts from: `origin/<default branch>`, or the local branch
   * without a remote. A worktree without a `branch` is detached at it.
   */
  base: string;
  /** The local branch it is on: the Ticket's own, new or reused; null when detached. */
  branch: string | null;
};

export type PrepareResult = {
  /** The command's exit code; non-zero when it failed or could not run. */
  exitCode: number;
  /** What it printed (stdout, then stderr), its tail when long. */
  output: string;
};

export type CreateWorktreeInput = {
  repositoryPath: string;
  projectId: number;
  conversationId: number;
  /**
   * The Ticket whose branch the worktree is on (ADR 0032); left out, the
   * worktree is detached at its base, as a Merge's is.
   */
  branch?: { ticketNumber: number; title: string };
};

/**
 * The worktrees module (ADR 0033): the only code in Tandembike that runs git.
 * Conversations take it as a dependency, like the runner.
 */
export type Worktrees = {
  /**
   * Fetches `origin` when there is one and adds a worktree at its default
   * branch, or at the local default branch without a remote. With a
   * `branch`, the worktree is on the Ticket's branch, found by its number
   * (`ticket-<n>-*`, else the old `t<n>-*`, the most recently committed
   * first) or else made as `ticket-<n>-<slug>` from that base; without one it
   * is detached there. Rejects when the branch is checked out in another
   * worktree, when the repository has no commits, or with git's message.
   */
  create(input: CreateWorktreeInput): Promise<CreatedWorktree>;
  state(path: string): Promise<WorktreeState>;
  /**
   * Runs the Project's Prepare command through the User's shell in the
   * worktree. It never rejects: a failure is a non-zero exit code.
   */
  runPrepare(path: string, command: string): Promise<PrepareResult>;
  /**
   * `git worktree remove` without force, then `git worktree prune`. Rejects
   * with git's message when the worktree holds changes. The branch stays.
   */
  remove(repositoryPath: string, path: string): Promise<void>;
  /**
   * The repository a worktree belongs to, read from the worktree itself, so a
   * worktree can be removed without knowing its Project's repository path;
   * null when the folder is gone or is not a linked worktree.
   */
  repositoryOf(path: string): Promise<string | null>;
  /**
   * The worktrees in the worktrees folder, found by their
   * `<project id>/c<conversation id>` path, with whether this module's owner
   * made them.
   */
  list(): Promise<ListedWorktree[]>;
};

export type ListedWorktree = {
  path: string;
  projectId: number;
  conversationId: number;
  /**
   * Whether this module's owner made it: false for one another data folder's
   * server made in the shared worktrees folder, or one without an owner mark.
   */
  owned: boolean;
};

/** The most output of a Prepare command kept: its tail, where errors are. */
const maxPrepareOutput = 8000;

const tail = (text: string): string =>
  text.length <= maxPrepareOutput
    ? text
    : `[output truncated]\n${text.slice(-maxPrepareOutput)}`;

/** The longest slug a new Ticket branch gets from the title. */
const maxSlug = 40;

/** A Ticket title as a branch-name slug: lower-case, hyphenated, capped. */
export function branchSlug(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, maxSlug)
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'work' : slug;
}

/**
 * The Ticket's existing local branch: `ticket-<n>-*`, else the Playbook's
 * old `t<n>-*`, the most recently committed at each step; null when none.
 * The number ends at the hyphen, so T42 never takes `ticket-420-…`.
 */
async function existingTicketBranch(
  repositoryPath: string,
  ticketNumber: number,
): Promise<string | null> {
  for (const prefix of [`ticket-${ticketNumber}-`, `t${ticketNumber}-`]) {
    const names = (
      await git(repositoryPath, [
        'for-each-ref',
        '--sort=-committerdate',
        '--format=%(refname:short)',
        `refs/heads/${prefix}*`,
      ])
    )
      .split('\n')
      .map((name) => name.trim())
      .filter((name) => name.startsWith(prefix) && name.length > prefix.length);
    if (names.length > 0) {
      return names[0];
    }
  }
  return null;
}

/** The worktree `branch` is checked out in, the main checkout included; null when none. */
async function checkedOutAt(
  repositoryPath: string,
  branch: string,
): Promise<string | null> {
  const listing = await git(repositoryPath, [
    'worktree',
    'list',
    '--porcelain',
  ]);
  for (const entry of listing.split('\n\n')) {
    const lines = entry.split('\n');
    const path = lines.find((line) => line.startsWith('worktree '));
    if (path && lines.includes(`branch refs/heads/${branch}`)) {
      return path.slice('worktree '.length);
    }
  }
  return null;
}

/** The folder worktrees go in: `<data folder>/worktrees`, `~/.tandembike` by default. */
export const worktreesRoot = (
  env: Record<string, string | undefined> = process.env,
): string =>
  join(env.TANDEMBIKE_DATA_DIR || join(homedir(), '.tandembike'), 'worktrees');

/**
 * The owner mark beside a worktree, `<project id>/c<id>.owner`, holding the
 * data folder of the server that made it. It sits outside the worktree, so it
 * never makes the worktree dirty.
 */
const ownerMark = (path: string): string => `${path}.owner`;

function ownerOf(path: string): string | null {
  try {
    return readFileSync(ownerMark(path), 'utf8');
  } catch {
    return null;
  }
}

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await run('git', args, { cwd });
    return stdout;
  } catch (error) {
    const failure = error as { stderr?: string; message: string };
    throw new Error((failure.stderr || failure.message).trim());
  }
}

/**
 * The worktrees module. `owner` names the data folder of the server using it:
 * servers with different data folders share the worktrees folder, so `list`
 * tells each its own worktrees by the owner mark `create` writes (T1279).
 */
export function createWorktrees({
  root = worktreesRoot(),
  owner,
}: {
  root?: string;
  owner: string;
}): Worktrees {
  // The same data folder however it was written, relative or with a trailing slash.
  const ownerFolder = resolve(owner);
  // `root` is only known at runtime and lies outside the project, so the
  // turbopackIgnore comments below keep `next build` from tracing the whole
  // project into the server output.
  return {
    async create({ repositoryPath, projectId, conversationId, branch }) {
      const detection = detectRepository(repositoryPath);
      if (!detection.ok) {
        throw new Error(detection.message);
      }
      const noCommits =
        'The repository has no commits yet, so a run has nothing to start from. Make a first commit, then start again.';
      if (detection.defaultBranch === null) {
        throw new Error(noCommits);
      }
      const path = join(
        /*turbopackIgnore: true*/ root,
        String(projectId),
        `c${conversationId}`,
      );
      let base = detection.defaultBranch;
      if (detection.remote !== null) {
        await git(repositoryPath, ['fetch', 'origin']);
        base = `origin/${base}`;
      }
      try {
        await git(repositoryPath, [
          'rev-parse',
          '--verify',
          `${base}^{commit}`,
        ]);
      } catch {
        throw new Error(noCommits);
      }
      if (branch === undefined) {
        await git(repositoryPath, ['worktree', 'add', '--detach', path, base]);
        writeFileSync(ownerMark(path), ownerFolder);
        return { path, base, branch: null };
      }
      const existing = await existingTicketBranch(
        repositoryPath,
        branch.ticketNumber,
      );
      let name: string;
      if (existing === null) {
        name = `ticket-${branch.ticketNumber}-${branchSlug(branch.title)}`;
        // No upstream: the branch is the Ticket's, never the default branch's.
        await git(repositoryPath, [
          'worktree',
          'add',
          '--no-track',
          '-b',
          name,
          path,
          base,
        ]);
      } else {
        name = existing;
        const busy = await checkedOutAt(repositoryPath, name);
        if (busy !== null) {
          throw new Error(
            `T${branch.ticketNumber}'s branch ${name} is checked out in ${busy}. Finish or close the run working there, or switch that checkout to another branch, then start again.`,
          );
        }
        await git(repositoryPath, ['worktree', 'add', path, name]);
      }
      writeFileSync(ownerMark(path), ownerFolder);
      return { path, base, branch: name };
    },

    async state(path) {
      if (!existsSync(path)) {
        return 'missing';
      }
      const status = await git(path, ['status', '--porcelain']);
      if (status.trim() !== '') {
        return 'dirty';
      }
      const remotes = (await git(path, ['remote'])).trim();
      const unpushed = await git(path, [
        'rev-list',
        '--count',
        'HEAD',
        '--not',
        remotes === '' ? '--branches' : '--remotes',
      ]);
      return Number(unpushed.trim()) > 0 ? 'unpushed' : 'clean';
    },

    async remove(repositoryPath, path) {
      await git(repositoryPath, ['worktree', 'remove', path]);
      rmSync(ownerMark(path), { force: true });
      await git(repositoryPath, ['worktree', 'prune']);
    },

    async repositoryOf(path) {
      if (!existsSync(path)) {
        return null;
      }
      try {
        const common = (
          await git(path, [
            'rev-parse',
            '--path-format=absolute',
            '--git-common-dir',
          ])
        ).trim();
        const top = (await git(path, ['rev-parse', '--show-toplevel'])).trim();
        // A linked worktree's common dir is the main repository's `.git`.
        return common.endsWith('/.git') && common !== join(top, '.git')
          ? common.slice(0, -'/.git'.length)
          : null;
      } catch {
        return null;
      }
    },

    async list() {
      const found: ListedWorktree[] = [];
      if (!existsSync(/*turbopackIgnore: true*/ root)) {
        return found;
      }
      for (const project of readdirSync(/*turbopackIgnore: true*/ root)) {
        if (!/^\d+$/.test(project)) {
          continue;
        }
        for (const folder of readdirSync(join(root, project))) {
          const match = /^c(\d+)$/.exec(folder);
          if (match) {
            const path = join(root, project, folder);
            found.push({
              path,
              projectId: Number(project),
              conversationId: Number(match[1]),
              owned: ownerOf(path) === ownerFolder,
            });
          }
        }
      }
      return found;
    },

    async runPrepare(path, command) {
      const shell = process.env.SHELL || '/bin/sh';
      try {
        const { stdout, stderr } = await run(shell, ['-c', command], {
          cwd: path,
          // The run's environment, so `npm ci` installs devDependencies. Next
          // types NODE_ENV as always set, which this environment leaves out.
          env: runEnvironment() as NodeJS.ProcessEnv,
          maxBuffer: 64 * 1024 * 1024,
        });
        return { exitCode: 0, output: tail(`${stdout}${stderr}`.trim()) };
      } catch (error) {
        const failure = error as {
          code?: number | string;
          stdout?: string;
          stderr?: string;
          message: string;
        };
        const printed = `${failure.stdout ?? ''}${failure.stderr ?? ''}`.trim();
        return {
          exitCode: typeof failure.code === 'number' ? failure.code : 1,
          output: tail(printed === '' ? failure.message : printed),
        };
      }
    },
  };
}
