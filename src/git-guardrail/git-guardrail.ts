// The git guardrail (T1081): a PreToolUse hook on Bash that denies destructive
// git commands. Node runs this file directly (type stripping), so it imports
// nothing outside Node and uses only erasable TypeScript.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type GuardrailContext = {
  /** The directory the command runs in. */
  cwd: string;
  /** The checked-out branch in `dir`, or null when unknown or detached. */
  currentBranch: (dir: string) => string | null;
};

export type Denial = {
  rule: string;
  reason: string;
};

const RULES: Record<string, string> = {
  'no-force-push':
    'force pushes (--force, -f, --force-with-lease, +ref) are not allowed',
  'no-push-main': 'pushing to main is not allowed; push a branch and open a PR',
  'no-reset-hard': 'git reset --hard is not allowed',
  'no-clean': 'git clean is not allowed',
  'no-branch-force-delete':
    'force-deleting a branch (git branch -D, --delete --force) is not allowed',
  'no-stash-drop': 'git stash drop and git stash clear are not allowed',
};

const deny = (rule: string): Denial => ({ rule, reason: RULES[rule] });

/** Characters that end a simple command outside quotes. */
const SEPARATORS = new Set([';', '&', '|', '\n', '(', ')']);

/** Index of the `)` closing a `$(` whose body starts at `start`. */
const closingParen = (input: string, start: number): number => {
  let depth = 1;
  let quote: string | null = null;
  for (let j = start; j < input.length; j++) {
    const c = input[j];
    if (quote) {
      if (c === '\\' && quote === '"') j++;
      else if (c === quote) quote = null;
    } else if (c === "'" || c === '"') quote = c;
    else if (c === '\\') j++;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return j;
  }
  return input.length;
};

/** Index of the backtick closing one whose body starts at `start`. */
const closingBacktick = (input: string, start: number): number => {
  for (let j = start; j < input.length; j++) {
    if (input[j] === '\\') j++;
    else if (input[j] === '`') return j;
  }
  return input.length;
};

/**
 * Splits a shell command line into its simple commands, each a list of
 * unquoted words. Commands inside `$(…)` and backticks are listed as well, so
 * a denied command cannot hide in a substitution.
 */
const parse = (input: string): string[][] => {
  const commands: string[][] = [];
  let words: string[] = [];
  let word = '';
  let inWord = false;
  const endWord = () => {
    if (inWord) words.push(word);
    word = '';
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length > 0) commands.push(words);
    words = [];
  };
  /** Parses a substitution body; returns the index after its closing mark. */
  const substitute = (start: number, end: number) => {
    commands.push(...parse(input.slice(start, end)));
    inWord = true;
    return end + 1;
  };

  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (c === '\\') {
      if (input[i + 1] !== '\n') word += input[i + 1] ?? '';
      inWord = true;
      i += 2;
    } else if (c === "'") {
      const end = input.indexOf("'", i + 1);
      const close = end === -1 ? input.length : end;
      word += input.slice(i + 1, close);
      inWord = true;
      i = close + 1;
    } else if (c === '"') {
      inWord = true;
      i++;
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\' && '"$`\\\n'.includes(input[i + 1] ?? '')) {
          word += input[i + 1];
          i += 2;
        } else if (input[i] === '$' && input[i + 1] === '(') {
          i = substitute(i + 2, closingParen(input, i + 2));
        } else if (input[i] === '`') {
          i = substitute(i + 1, closingBacktick(input, i + 1));
        } else {
          word += input[i];
          i++;
        }
      }
      i++;
    } else if (c === '$' && input[i + 1] === '(') {
      i = substitute(i + 2, closingParen(input, i + 2));
    } else if (c === '`') {
      i = substitute(i + 1, closingBacktick(input, i + 1));
    } else if (
      c === '&' &&
      (input[i - 1] === '>' || input[i - 1] === '<' || input[i + 1] === '>')
    ) {
      // A redirection such as `2>&1` or `&>`, not a separator.
      word += c;
      inWord = true;
      i++;
    } else if (SEPARATORS.has(c)) {
      endCommand();
      i++;
    } else if (/\s/.test(c)) {
      endWord();
      i++;
    } else if (c === '#' && !inWord) {
      const newline = input.indexOf('\n', i);
      i = newline === -1 ? input.length : newline;
    } else {
      word += c;
      inWord = true;
      i++;
    }
  }
  endCommand();
  return commands;
};

/** Reserved words and wrappers that run the command after them. */
const PREFIXES = new Set([
  '{',
  '}',
  '!',
  'if',
  'then',
  'else',
  'elif',
  'do',
  'while',
  'until',
  'time',
  'command',
  'builtin',
  'exec',
  'nohup',
  'nice',
  'sudo',
  'env',
]);

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** Drops the reserved words, wrappers and variable assignments before a program. */
const program = (words: string[]): string[] => {
  let i = 0;
  let wrapped = false;
  while (i < words.length) {
    const word = words[i];
    if (PREFIXES.has(word)) wrapped = true;
    else if (!(ASSIGNMENT.test(word) || (wrapped && word.startsWith('-'))))
      break;
    i++;
  }
  return words.slice(i);
};

const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);

/** The script a shell runs with `-c`, as in `bash -lc '…'`, or null. */
const shellScript = (args: string[]): string | null => {
  const flag = args.findIndex(
    (arg) => /^-[a-zA-Z]+$/.test(arg) && arg.includes('c'),
  );
  return flag === -1 ? null : (args[flag + 1] ?? null);
};

const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** Whether `args` hold the short flag `flag`, alone or in a cluster like `-df`. */
const hasShortFlag = (args: string[], flag: string): boolean =>
  args.some((arg) => /^-[a-zA-Z]+$/.test(arg) && arg.slice(1).includes(flag));

const checkBranch = (args: string[]): Denial | null => {
  const forceDelete = hasShortFlag(args, 'D');
  const remove = args.includes('--delete') || hasShortFlag(args, 'd');
  const force = args.includes('--force') || hasShortFlag(args, 'f');
  return forceDelete || (remove && force)
    ? deny('no-branch-force-delete')
    : null;
};

const PUSH_OPTIONS_WITH_VALUE = new Set([
  '-o',
  '--push-option',
  '--repo',
  '--receive-pack',
  '--exec',
]);

const PUSH_ALL_BRANCHES = new Set(['--all', '--branches', '--mirror']);

/** The branch a refspec writes to on the remote, without `refs/heads/`. */
const pushTarget = (refspec: string, currentBranch: () => string | null) => {
  const spec = refspec.replace(/^\+/, '');
  const colon = spec.indexOf(':');
  let target = colon === -1 ? spec : spec.slice(colon + 1);
  if (colon === -1 && (target === 'HEAD' || target === '@')) {
    target = currentBranch() ?? target;
  }
  return target.replace(/^refs\/heads\//, '');
};

const checkPush = (
  args: string[],
  currentBranch: () => string | null,
): Denial | null => {
  const positional: string[] = [];
  let force = false;
  let allBranches = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (PUSH_OPTIONS_WITH_VALUE.has(arg)) {
      i++;
    } else if (arg === '--force' || arg.startsWith('--force-with-lease')) {
      force = true;
    } else if (PUSH_ALL_BRANCHES.has(arg)) {
      allBranches = true;
    } else if (/^-[a-zA-Z]/.test(arg)) {
      // A short-flag cluster such as `-uf`; `-o` takes the rest as its value.
      const flags = arg.slice(1).split('o')[0];
      if (flags.includes('f')) force = true;
      if (arg === `-${flags}o`) i++;
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }
  const [, ...refspecs] = positional;
  if (force || refspecs.some((refspec) => refspec.startsWith('+'))) {
    return deny('no-force-push');
  }
  const targetsMain =
    allBranches ||
    (refspecs.length === 0
      ? currentBranch() === 'main'
      : refspecs.some(
          (refspec) => pushTarget(refspec, currentBranch) === 'main',
        ));
  return targetsMain ? deny('no-push-main') : null;
};

/** Git's options before the subcommand that take a separate value. */
const GIT_OPTIONS_WITH_VALUE = new Set([
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--config-env',
]);

const checkGit = (
  globalAndArgs: string[],
  context: GuardrailContext,
): Denial | null => {
  let dir = context.cwd;
  let i = 0;
  for (; i < globalAndArgs.length; i++) {
    const arg = globalAndArgs[i];
    if (arg === '-C') {
      dir = resolve(dir, globalAndArgs[++i] ?? '');
    } else if (GIT_OPTIONS_WITH_VALUE.has(arg)) {
      i++;
    } else if (!arg.startsWith('-')) {
      break;
    }
  }
  const [subcommand, ...rest] = globalAndArgs.slice(i);
  switch (subcommand) {
    case 'push':
      return checkPush(rest, () => context.currentBranch(dir));
    case 'reset':
      return rest.includes('--hard') ? deny('no-reset-hard') : null;
    case 'clean':
      return deny('no-clean');
    case 'branch':
      return checkBranch(rest);
    case 'stash':
      return rest[0] === 'drop' || rest[0] === 'clear'
        ? deny('no-stash-drop')
        : null;
    default:
      return null;
  }
};

export const checkCommand = (
  command: string,
  context: GuardrailContext,
): Denial | null => {
  let cwd = context.cwd;
  for (const words of parse(command)) {
    const [name, ...args] = program(words);
    if (name === undefined) continue;
    const here = { ...context, cwd };
    let denial: Denial | null = null;
    switch (basename(name)) {
      case 'cd':
        if (args[0] && args[0] !== '-' && !args[0].startsWith('~')) {
          cwd = resolve(cwd, args[0]);
        }
        break;
      case 'git':
        denial = checkGit(args, here);
        break;
      case 'eval':
        denial = checkCommand(args.join(' '), here);
        break;
      default: {
        const script = SHELLS.has(basename(name)) ? shellScript(args) : null;
        if (script !== null) denial = checkCommand(script, here);
      }
    }
    if (denial) return denial;
  }
  return null;
};

export type HookDecision = {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse';
    permissionDecision: 'deny';
    permissionDecisionReason: string;
  };
};

/**
 * The hook's answer to one PreToolUse input (JSON, as Claude Code sends it on
 * stdin): a denial, or null to leave the decision to the permission mode.
 * Input it cannot read is left alone rather than blocking every command.
 */
export const hookDecision = (
  input: string,
  currentBranch: GuardrailContext['currentBranch'],
): HookDecision | null => {
  let parsed: { tool_name?: unknown; cwd?: unknown; tool_input?: unknown };
  try {
    parsed = JSON.parse(input);
  } catch {
    return null;
  }
  const command = (parsed.tool_input as { command?: unknown } | undefined)
    ?.command;
  if (parsed.tool_name !== 'Bash' || typeof command !== 'string') return null;
  const cwd = typeof parsed.cwd === 'string' ? parsed.cwd : process.cwd();
  const denial = checkCommand(command, { cwd, currentBranch });
  if (!denial) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Git guardrail (${denial.rule}): ${denial.reason}. This is repository policy, enforced by the PreToolUse hook in src/git-guardrail/, not a bug; do not work around it. If the work needs it, ask the User to run the command.`,
    },
  };
};

const gitBranch = (dir: string): string | null => {
  try {
    const branch = execFileSync(
      'git',
      ['-C', dir, 'symbolic-ref', '--short', '-q', 'HEAD'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return branch === '' ? null : branch;
  } catch {
    return null;
  }
};

if (import.meta.main) {
  const decision = hookDecision(readFileSync(0, 'utf8'), gitBranch);
  if (decision) process.stdout.write(JSON.stringify(decision));
}
