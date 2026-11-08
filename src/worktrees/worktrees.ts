import { detectRepository } from '../repository/detect-repository';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * What a worktree holds, for deciding whether it is safe to remove or
 * resume in: `missing` when the folder is gone.
 */
export type WorktreeState = 'clean' | 'dirty' | 'missing';

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

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await run('git', args, { cwd });
    return stdout;
  } catch (error) {
    const failure = error as { stderr?: string; message: string };
    throw new Error((failure.stderr || failure.message).trim());
  }
}

export function createWorktrees({
  root = worktreesRoot(),
}: {
  root?: string;
} = {}): Worktrees {
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
      return { path, base };
    },

    async state(path) {
      if (!existsSync(path)) {
        return 'missing';
      }
      const status = await git(path, ['status', '--porcelain']);
      return status.trim() === '' ? 'clean' : 'dirty';
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
