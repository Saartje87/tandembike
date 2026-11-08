import { commonGitDir } from './detect-repository';
import { realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

/** `path` with symlinks resolved, as far as it exists. */
export function canonicalFolder(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/**
 * The folder of the repository that `folder` is in: the nearest folder above
 * it, or itself, with a `.git`. A worktree maps to the repository it was made
 * from, even when it lies outside that repository. `null` when no folder above
 * it is a repository. It reads files only.
 */
export function repositoryRootOf(folder: string): string | null {
  let current = canonicalFolder(folder);
  for (;;) {
    const gitDir = commonGitDir(current);
    if (gitDir !== null) {
      return basename(gitDir) === '.git' ? dirname(gitDir) : current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}
