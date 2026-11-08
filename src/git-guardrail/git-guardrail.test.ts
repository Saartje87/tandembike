// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { checkCommand, hookDecision } from './git-guardrail';

const onBranch = (branch: string | null) => ({
  cwd: '/repo',
  currentBranch: () => branch,
});

const ruleOf = (command: string, branch: string | null = 'feature') =>
  checkCommand(command, onBranch(branch))?.rule ?? null;

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
