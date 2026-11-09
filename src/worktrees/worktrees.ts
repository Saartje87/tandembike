import { detectRepository } from '../repository/detect-repository';
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
  /** What it is detached at: `origin/<default branch>`, or the local branch without a remote. */
  base: string;
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
};

/**
 * The worktrees module (ADR 0033): the only code in Tandembike that runs git.
 * Conversations take it as a dependency, like the runner.
 */
export type Worktrees = {
  /**
   * Fetches `origin` when there is one and adds a detached worktree at its
   * default branch, or at the local default branch without a remote. Rejects
   * with git's message when that fails.
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
  return {
    async create({ repositoryPath, projectId, conversationId }) {
      const detection = detectRepository(repositoryPath);
      if (!detection.ok) {
        throw new Error(detection.message);
      }
      if (detection.defaultBranch === null) {
        throw new Error('The repository has no default branch to start from.');
      }
      const path = join(root, String(projectId), `c${conversationId}`);
      let base = detection.defaultBranch;
      if (detection.remote !== null) {
        await git(repositoryPath, ['fetch', 'origin']);
        base = `origin/${base}`;
      }
      await git(repositoryPath, ['worktree', 'add', '--detach', path, base]);
      writeFileSync(ownerMark(path), ownerFolder);
      return { path, base };
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
      if (!existsSync(root)) {
        return found;
      }
      for (const project of readdirSync(root)) {
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
