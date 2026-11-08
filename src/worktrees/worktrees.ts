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
};

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
  };
}
