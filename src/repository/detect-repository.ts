import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

export type RepositoryRefusal =
  | 'not-absolute'
  | 'not-a-directory'
  | 'not-a-repository';

export type RepositoryDetection =
  | {
      ok: true;
      path: string;
      /** From `origin/HEAD`, else the branch the repository has checked out. */
      defaultBranch: string | null;
      /** The `origin` remote's URL. */
      remote: string | null;
      /** A `#` Reference template for a GitHub remote's issues. */
      referenceTemplate: { prefix: string; url: string } | null;
      /** Commands that could define green, best first. */
      checkCommands: string[];
    }
  | { ok: false; reason: RepositoryRefusal; message: string };

const refusals: Record<RepositoryRefusal, string> = {
  'not-absolute': 'Enter an absolute path, starting with /.',
  'not-a-directory': 'There is no directory at this path.',
  'not-a-repository':
    'This folder is not a git repository: it has no .git inside.',
};

function refusal(reason: RepositoryRefusal): RepositoryDetection {
  return { ok: false, reason, message: refusals[reason] };
}

function read(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** The repository's own `.git` folder, following a worktree's `gitdir:` file. */
function commonGitDir(path: string): string | null {
  const dot = join(path, '.git');
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(dot);
  } catch {
    return null;
  }
  if (stat.isDirectory()) {
    return dot;
  }
  const gitdir = read(dot)
    ?.match(/^gitdir:\s*(.+)$/m)?.[1]
    ?.trim();
  if (!gitdir) {
    return null;
  }
  const worktreeDir = resolve(path, gitdir);
  const common = read(join(worktreeDir, 'commondir'))?.trim();
  return common ? resolve(worktreeDir, common) : worktreeDir;
}

function defaultBranch(gitDir: string): string | null {
  const origin = read(join(gitDir, 'refs/remotes/origin/HEAD'))?.match(
    /^ref:\s*refs\/remotes\/origin\/(.+)$/m,
  )?.[1];
  const head = read(join(gitDir, 'HEAD'))?.match(
    /^ref:\s*refs\/heads\/(.+)$/m,
  )?.[1];
  return origin?.trim() ?? head?.trim() ?? null;
}

function originUrl(gitDir: string): string | null {
  const config = read(join(gitDir, 'config'));
  if (!config) {
    return null;
  }
  let inOrigin = false;
  for (const line of config.split('\n')) {
    const section = line.match(/^\s*\[(.+)\]\s*$/);
    if (section) {
      inOrigin = /^remote\s+"origin"$/.test(section[1] ?? '');
      continue;
    }
    const url = inOrigin ? line.match(/^\s*url\s*=\s*(.+?)\s*$/) : null;
    if (url) {
      return url[1] ?? null;
    }
  }
  return null;
}

function githubTemplate(remote: string | null) {
  const match = remote?.match(
    /^(?:https?:\/\/|ssh:\/\/git@|git@)github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/,
  );
  return match
    ? {
        prefix: '#',
        url: `https://github.com/${match[1]}/${match[2]}/issues/{n}`,
      }
    : null;
}

function packageManager(path: string): 'npm' | 'pnpm' | 'yarn' | 'bun' {
  if (existsSync(join(path, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(path, 'yarn.lock'))) return 'yarn';
  if (
    existsSync(join(path, 'bun.lock')) ||
    existsSync(join(path, 'bun.lockb'))
  ) {
    return 'bun';
  }
  return 'npm';
}

function checkCommands(path: string): string[] {
  const commands: string[] = [];
  const pkg = read(join(path, 'package.json'));
  if (pkg !== null) {
    let scripts: Record<string, unknown> = {};
    try {
      scripts = JSON.parse(pkg)?.scripts ?? {};
    } catch {
      // Not valid JSON: it offers no candidate.
    }
    const manager = packageManager(path);
    if (typeof scripts.check === 'string') {
      commands.push(`${manager} run check`);
    } else if (typeof scripts.test === 'string') {
      commands.push(`${manager} test`);
    }
  }
  const makefile = read(join(path, 'Makefile'));
  for (const target of ['check', 'test']) {
    if (makefile && new RegExp(`^${target}\\s*:`, 'm').test(makefile)) {
      commands.push(`make ${target}`);
    }
  }
  if (existsSync(join(path, 'Cargo.toml'))) commands.push('cargo test');
  if (existsSync(join(path, 'go.mod'))) commands.push('go test ./...');
  if (read(join(path, 'pyproject.toml'))?.includes('pytest')) {
    commands.push('pytest');
  }
  return commands;
}

/**
 * What Tandembike can tell about the repository at `path` by reading files:
 * it runs no git command (ADR 0019).
 */
export function detectRepository(path: string): RepositoryDetection {
  if (!isAbsolute(path)) {
    return refusal('not-absolute');
  }
  try {
    if (!statSync(path).isDirectory()) {
      return refusal('not-a-directory');
    }
  } catch {
    return refusal('not-a-directory');
  }
  const gitDir = commonGitDir(path);
  if (gitDir === null) {
    return refusal('not-a-repository');
  }
  const remote = originUrl(gitDir);
  return {
    ok: true,
    path,
    defaultBranch: defaultBranch(gitDir),
    remote,
    referenceTemplate: githubTemplate(remote),
    checkCommands: checkCommands(path),
  };
}
