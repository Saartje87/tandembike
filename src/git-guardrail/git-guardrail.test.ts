import { afterEach, describe, expect, it } from 'vitest';

import {
  checkCommand,
  copilotHookDecision,
  gitBranch,
  hookDecision,
} from './git-guardrail';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const onBranch = (branch: string | null | undefined) => ({
  cwd: '/repo',
  currentBranch: () => branch,
});

const ruleOf = (
  command: string,
  branch: string | null | undefined = 'feature',
) => checkCommand(command, onBranch(branch))?.rule ?? null;

describe('checkCommand', () => {
  it('denies git reset --hard', () => {
    expect(ruleOf('git reset --hard')).toBe('no-reset-hard');
    expect(ruleOf('git reset --hard HEAD~1')).toBe('no-reset-hard');
  });

  it('denies every git clean', () => {
    expect(ruleOf('git clean -fd')).toBe('no-clean');
    expect(ruleOf('git clean -f')).toBe('no-clean');
    expect(ruleOf('git clean -n')).toBe('no-clean');
  });

  it('denies force-deleting a branch', () => {
    expect(ruleOf('git branch -D old')).toBe('no-branch-force-delete');
    expect(ruleOf('git branch --delete --force old')).toBe(
      'no-branch-force-delete',
    );
    expect(ruleOf('git branch -d -f old')).toBe('no-branch-force-delete');
    expect(ruleOf('git branch -df old')).toBe('no-branch-force-delete');
  });

  it('allows a safe branch delete and listing branches', () => {
    expect(ruleOf('git branch -d merged')).toBeNull();
    expect(ruleOf('git branch --delete merged')).toBeNull();
    expect(ruleOf('git branch -a')).toBeNull();
    expect(ruleOf('git branch -f topic HEAD')).toBeNull();
  });

  it('denies dropping or clearing stashes', () => {
    expect(ruleOf('git stash drop')).toBe('no-stash-drop');
    expect(ruleOf('git stash drop stash@{1}')).toBe('no-stash-drop');
    expect(ruleOf('git stash clear')).toBe('no-stash-drop');
  });

  it('allows other stash commands', () => {
    expect(ruleOf('git stash')).toBeNull();
    expect(ruleOf('git stash pop')).toBeNull();
    expect(ruleOf('git stash list')).toBeNull();
  });

  it('denies force pushes', () => {
    expect(ruleOf('git push --force origin topic')).toBe('no-force-push');
    expect(ruleOf('git push -f origin topic')).toBe('no-force-push');
    expect(ruleOf('git push -uf origin topic')).toBe('no-force-push');
    expect(ruleOf('git push --force-with-lease origin topic')).toBe(
      'no-force-push',
    );
    expect(ruleOf('git push --force-with-lease=topic:abc origin topic')).toBe(
      'no-force-push',
    );
    expect(ruleOf('git push origin +topic')).toBe('no-force-push');
    expect(ruleOf('git push origin +HEAD:topic')).toBe('no-force-push');
  });

  it('denies pushes to main by refspec', () => {
    expect(ruleOf('git push origin main')).toBe('no-push-main');
    expect(ruleOf('git push origin HEAD:main')).toBe('no-push-main');
    expect(ruleOf('git push origin topic:refs/heads/main')).toBe(
      'no-push-main',
    );
    expect(ruleOf('git push origin :main')).toBe('no-push-main');
    expect(ruleOf('git push --all origin')).toBe('no-push-main');
  });

  it('denies a push without a refspec while on main', () => {
    expect(ruleOf('git push', 'main')).toBe('no-push-main');
    expect(ruleOf('git push origin', 'main')).toBe('no-push-main');
    expect(ruleOf('git push -u origin HEAD', 'main')).toBe('no-push-main');
  });

  it('allows pushing a topic branch', () => {
    expect(ruleOf('git push')).toBeNull();
    expect(ruleOf('git push -u origin ticket-1-x')).toBeNull();
    expect(ruleOf('git push origin HEAD')).toBeNull();
    expect(ruleOf('git push origin main-fixes')).toBeNull();
    expect(ruleOf('git push -o ci.skip origin topic')).toBeNull();
    expect(ruleOf('git push origin topic', 'main')).toBeNull();
  });

  it('asks for the current branch in the directory git runs in', () => {
    const dirs: string[] = [];
    checkCommand('git -C /other push', {
      cwd: '/repo',
      currentBranch: (dir) => {
        dirs.push(dir);
        return 'topic';
      },
    });
    expect(dirs).toEqual(['/other']);
  });

  it('allows reverting files with checkout -- and restore', () => {
    expect(ruleOf('git checkout -- src/a.ts')).toBeNull();
    expect(ruleOf('git checkout .')).toBeNull();
    expect(ruleOf('git restore src/a.ts')).toBeNull();
    expect(ruleOf('git restore .')).toBeNull();
  });

  it('checks each part of a compound command', () => {
    expect(ruleOf('git status && git reset --hard')).toBe('no-reset-hard');
    expect(ruleOf('git status; git clean -fd')).toBe('no-clean');
    expect(ruleOf('git status || git stash clear')).toBe('no-stash-drop');
    expect(ruleOf('git log | head; git push -f origin x')).toBe(
      'no-force-push',
    );
    expect(ruleOf('npm test & git clean -f')).toBe('no-clean');
    expect(ruleOf('git status\ngit reset --hard')).toBe('no-reset-hard');
    expect(ruleOf('(git reset --hard)')).toBe('no-reset-hard');
    expect(ruleOf('{ git clean -f; }')).toBe('no-clean');
  });

  it('checks commands inside substitutions and shell -c strings', () => {
    expect(ruleOf('echo $(git reset --hard)')).toBe('no-reset-hard');
    expect(ruleOf('echo "$(git clean -f)"')).toBe('no-clean');
    expect(ruleOf('echo `git stash drop`')).toBe('no-stash-drop');
    expect(ruleOf("bash -c 'git reset --hard'")).toBe('no-reset-hard');
    expect(ruleOf('sh -lc "git status && git clean -f"')).toBe('no-clean');
    expect(ruleOf("eval 'git reset --hard'")).toBe('no-reset-hard');
  });

  it('sees through quotes, env assignments and wrappers', () => {
    expect(ruleOf("git reset '--hard'")).toBe('no-reset-hard');
    expect(ruleOf('git "clean" -f')).toBe('no-clean');
    expect(ruleOf('GIT_DIR=.git git reset --hard')).toBe('no-reset-hard');
    expect(ruleOf('env FOO=1 git clean -f')).toBe('no-clean');
    expect(ruleOf('command git clean -f')).toBe('no-clean');
    expect(ruleOf('/usr/bin/git clean -f')).toBe('no-clean');
    expect(ruleOf('git -c core.pager=cat --no-pager clean -f')).toBe(
      'no-clean',
    );
  });

  it('does not deny git words that are only text', () => {
    expect(ruleOf("echo 'git reset --hard'")).toBeNull();
    expect(ruleOf('git commit -m "no git clean; git reset --hard"')).toBeNull();
    expect(ruleOf('grep -n "git push --force" docs/a.md')).toBeNull();
    expect(ruleOf('git status 2>&1 | tail')).toBeNull();
  });

  it('follows cd into the directory a later git push runs in', () => {
    const dirs: string[] = [];
    checkCommand('cd sub && git push', {
      cwd: '/repo',
      currentBranch: (dir) => {
        dirs.push(dir);
        return 'topic';
      },
    });
    expect(dirs).toEqual(['/repo/sub']);
  });

  it('names the rule in its reason', () => {
    expect(checkCommand('git clean -f', onBranch('x'))?.reason).toMatch(
      /git clean/,
    );
  });

  it('does not check the body of a heredoc', () => {
    expect(ruleOf('cat <<EOF\ngit clean -f\nEOF')).toBeNull();
    expect(
      ruleOf("gh pr create --body-file - <<'EOF'\ngit reset --hard\nEOF"),
    ).toBeNull();
    expect(ruleOf('cat <<-EOF\n\tgit clean -f\n\tEOF')).toBeNull();
  });

  it('checks the commands around a heredoc', () => {
    expect(ruleOf('cat <<EOF\nhi\nEOF\ngit clean -f')).toBe('no-clean');
    expect(ruleOf('cat <<EOF && git clean -f\nhi\nEOF')).toBe('no-clean');
    expect(ruleOf('git reset --hard <<<x')).toBe('no-reset-hard');
  });

  it('sees through timeout and xargs', () => {
    expect(ruleOf('timeout 5 git clean -f')).toBe('no-clean');
    expect(ruleOf('timeout -s KILL 5m git reset --hard')).toBe('no-reset-hard');
    expect(ruleOf('xargs git clean -f')).toBe('no-clean');
    expect(ruleOf('echo x | xargs -n 1 git branch -D')).toBe(
      'no-branch-force-delete',
    );
  });

  it('denies a push to main written as heads/main', () => {
    expect(ruleOf('git push origin heads/main')).toBe('no-push-main');
  });

  it('treats arguments after -- as paths', () => {
    expect(ruleOf('git reset -- --hard')).toBeNull();
    expect(ruleOf('git branch --contains x -- -D')).toBeNull();
  });

  it('denies a commit on main, naming the rule', () => {
    expect(ruleOf('git commit -m x', 'main')).toBe('no-commit-off-branch');
    expect(ruleOf('git add . && git commit -m x', 'main')).toBe(
      'no-commit-off-branch',
    );
    expect(checkCommand('git commit', onBranch('main'))?.reason).toMatch(
      /main/,
    );
  });

  it('denies a commit on a detached HEAD', () => {
    expect(ruleOf('git commit -m x', null)).toBe('no-commit-off-branch');
  });

  it('allows a commit when the branch is unknown', () => {
    expect(ruleOf('git commit -m x', undefined)).toBeNull();
  });

  it('allows a commit on a ticket branch', () => {
    expect(ruleOf('git commit -m x', 'ticket-1-x')).toBeNull();
    expect(ruleOf('git commit --amend --no-edit', 'ticket-1-x')).toBeNull();
  });

  it('checks a commit against the branch of the directory it runs in', () => {
    const branches: Record<string, string> = {
      '/repo': 'main',
      '/repo/wt': 'ticket-1-x',
      '/other': 'ticket-2-y',
    };
    const inDirs = {
      cwd: '/repo',
      currentBranch: (dir: string) => branches[dir] ?? null,
    };
    const rule = (command: string) =>
      checkCommand(command, inDirs)?.rule ?? null;
    expect(rule('git commit -m x')).toBe('no-commit-off-branch');
    expect(rule('git -C /other commit -m x')).toBeNull();
    expect(rule('git -C wt commit -m x')).toBeNull();
    expect(rule('cd wt && git commit -m x')).toBeNull();
    expect(rule('cd /other && git commit -m x')).toBeNull();
    expect(rule('cd /other && git -C /repo commit -m x')).toBe(
      'no-commit-off-branch',
    );
  });

  it('allows merging and other commands on main', () => {
    expect(ruleOf('git merge origin/main', 'main')).toBeNull();
    expect(ruleOf('git pull', 'main')).toBeNull();
    expect(ruleOf('git log', 'main')).toBeNull();
  });

  it('allows ordinary git commands', () => {
    expect(ruleOf('git status')).toBeNull();
    expect(ruleOf('git reset HEAD file.ts')).toBeNull();
    expect(ruleOf('git reset --soft HEAD~1')).toBeNull();
  });
});

describe('hookDecision', () => {
  const noBranch = () => null;

  it('denies a Bash call whose command a rule denies, naming the rule', () => {
    const decision = hookDecision(
      JSON.stringify({
        tool_name: 'Bash',
        cwd: '/repo',
        tool_input: { command: 'git reset --hard' },
      }),
      noBranch,
    );
    expect(decision?.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(decision?.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(decision?.hookSpecificOutput.permissionDecisionReason).toMatch(
      /no-reset-hard.*git reset --hard is not allowed/,
    );
    expect(decision?.hookSpecificOutput.permissionDecisionReason).toMatch(
      /policy/,
    );
  });

  it('makes no decision on an allowed command', () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      cwd: '/repo',
      tool_input: { command: 'git status' },
    });
    expect(hookDecision(input, noBranch)).toBeNull();
  });

  it('makes no decision on input it cannot read', () => {
    expect(hookDecision('not json', noBranch)).toBeNull();
    expect(hookDecision(JSON.stringify({ tool_name: 'Read' }), noBranch)).toBe(
      null,
    );
  });
});

describe('copilotHookDecision', () => {
  const noBranch = () => null;
  /** A preToolUse input as Copilot's command hooks get it on stdin. */
  const bashCall = (command: string, cwd = '/repo') =>
    JSON.stringify({
      timestamp: 1_704_614_600_000,
      cwd,
      toolName: 'bash',
      toolArgs: JSON.stringify({ command, description: 'Run it' }),
    });

  it('denies a bash call whose command a rule denies, naming the rule', () => {
    const decision = copilotHookDecision(
      bashCall('git push --force origin topic'),
      noBranch,
    );
    expect(decision?.permissionDecision).toBe('deny');
    expect(decision?.permissionDecisionReason).toMatch(
      /^Git guardrail \(no-force-push\): force pushes .* are not allowed\./,
    );
    expect(decision?.permissionDecisionReason).toMatch(/policy/);
  });

  it('gives the same reason as the Claude Code hook', () => {
    const claude = hookDecision(
      JSON.stringify({
        tool_name: 'Bash',
        cwd: '/repo',
        tool_input: { command: 'git clean -fd' },
      }),
      noBranch,
    );
    expect(
      copilotHookDecision(bashCall('git clean -fd'), noBranch)
        ?.permissionDecisionReason,
    ).toBe(claude?.hookSpecificOutput.permissionDecisionReason);
  });

  it('checks a commit against the branch of the directory it runs in', () => {
    const branches = (dir: string) => (dir === '/main' ? 'main' : 'topic');
    expect(
      copilotHookDecision(bashCall('git commit -m x', '/main'), branches)
        ?.permissionDecisionReason,
    ).toMatch(/no-commit-off-branch/);
    expect(
      copilotHookDecision(bashCall('git commit -m x', '/topic'), branches),
    ).toBeNull();
  });

  it('makes no decision on an allowed command', () => {
    expect(copilotHookDecision(bashCall('git status'), noBranch)).toBeNull();
    expect(
      copilotHookDecision(bashCall('git push origin topic'), noBranch),
    ).toBeNull();
  });

  it('reads toolArgs given as an object', () => {
    const input = JSON.stringify({
      cwd: '/repo',
      toolName: 'bash',
      toolArgs: { command: 'git reset --hard' },
    });
    expect(
      copilotHookDecision(input, noBranch)?.permissionDecisionReason,
    ).toMatch(/no-reset-hard/);
  });

  it('makes no decision on other tools or input it cannot read', () => {
    expect(copilotHookDecision('not json', noBranch)).toBeNull();
    expect(
      copilotHookDecision(
        JSON.stringify({ toolName: 'view', toolArgs: '{"path":"/repo"}' }),
        noBranch,
      ),
    ).toBeNull();
    expect(
      copilotHookDecision(
        JSON.stringify({ toolName: 'bash', toolArgs: 'not json' }),
        noBranch,
      ),
    ).toBeNull();
  });
});

describe('gitBranch', () => {
  const dirs: string[] = [];
  const tempDir = () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-guardrail-'));
    dirs.push(dir);
    return dir;
  };
  const git = (dir: string, ...args: string[]) =>
    execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' });

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
  });

  it('reads the checked-out branch, and null on a detached HEAD', () => {
    const dir = tempDir();
    git(dir, 'init', '-q', '-b', 'topic');
    git(
      dir,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'x',
    );
    expect(gitBranch(dir)).toBe('topic');
    git(dir, 'checkout', '-q', '--detach');
    expect(gitBranch(dir)).toBeNull();
  });

  it('is undefined outside a repository', () => {
    expect(gitBranch(tempDir())).toBeUndefined();
  });
});

describe("the repository's Copilot hook", () => {
  const root = resolve(import.meta.dirname, '../..');
  type CommandHook = { type: string; bash: string; cwd?: string };
  const config = JSON.parse(
    readFileSync(join(root, '.github/hooks/git-guardrail.json'), 'utf8'),
  ) as { version: number; hooks: { preToolUse: CommandHook[] } };

  /** Runs the configured hook as Copilot does: its `bash` line, input on stdin. */
  const runHook = (toolArgs: object) => {
    const [hook] = config.hooks.preToolUse;
    return execFileSync('bash', ['-c', hook.bash], {
      cwd: resolve(root, hook.cwd ?? '.'),
      input: JSON.stringify({
        timestamp: 0,
        cwd: tmpdir(),
        toolName: 'bash',
        toolArgs: JSON.stringify(toolArgs),
      }),
      encoding: 'utf8',
    });
  };

  it('is a version 1 preToolUse command hook', () => {
    expect(config.version).toBe(1);
    expect(config.hooks.preToolUse).toHaveLength(1);
    expect(config.hooks.preToolUse[0].type).toBe('command');
  });

  it('denies a destructive git command with the rule name', () => {
    const output = JSON.parse(runHook({ command: 'git reset --hard' }));
    expect(output.permissionDecision).toBe('deny');
    expect(output.permissionDecisionReason).toMatch(/no-reset-hard/);
  });

  it('prints nothing for an allowed command', () => {
    expect(runHook({ command: 'git status' })).toBe('');
  });
});
