// The git guardrail (T1081): a PreToolUse hook on Bash that denies destructive
// git commands. One rule check, with an adapter per Agent kind: Claude Code's
// hook (`.claude/settings.json`) and Copilot's (`.github/hooks/git-guardrail.json`,
// T1396). Node runs this file directly (type stripping), so it imports
// nothing outside Node and uses only erasable TypeScript.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The checked-out branch: its name, null on a detached HEAD, or undefined
 * when unknown, such as outside a repository.
 */
export type Branch = string | null | undefined;

export type GuardrailContext = {
  /** The directory the command runs in. */
  cwd: string;
  /** The checked-out branch in `dir`. */
  currentBranch: (dir: string) => Branch;
};

const RULES = {
  'no-force-push':
    'force pushes (--force, -f, --force-with-lease, +ref) are not allowed',
  'no-push-main': 'pushing to main is not allowed; push a branch and open a PR',
  'no-reset-hard': 'git reset --hard is not allowed',
  'no-clean': 'git clean is not allowed',
  'no-branch-force-delete':
    'force-deleting a branch (git branch -D, --delete --force) is not allowed',
  'no-stash-drop': 'git stash drop and git stash clear are not allowed',
  'no-commit-off-branch':
    'committing on main or on a detached HEAD is not allowed; check `git branch --show-current` and commit on the Ticket branch',
} as const;

export type Rule = keyof typeof RULES;

export type Denial = {
  rule: Rule;
  reason: string;
};

const deny = (rule: Rule): Denial => ({ rule, reason: RULES[rule] });

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

type Heredoc = { delimiter: string; stripTabs: boolean };

/** Index after the body of each heredoc whose body starts at `start`. */
const skipHeredocs = (
  input: string,
  start: number,
  heredocs: Heredoc[],
): number => {
  let i = start;
  for (const { delimiter, stripTabs } of heredocs) {
    while (i < input.length) {
      const newline = input.indexOf('\n', i);
      const end = newline === -1 ? input.length : newline;
      const line = input.slice(i, end);
      i = end + 1;
      if ((stripTabs ? line.replace(/^\t+/, '') : line) === delimiter) break;
    }
  }
  return i;
};

/**
 * Splits a shell command line into its simple commands, each a list of
 * unquoted words. Commands inside `$(…)` and backticks are listed as well, so
 * a denied command cannot hide in a substitution. Heredoc bodies are text,
 * not commands, and are skipped.
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

  let heredocs: Heredoc[] = [];

  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (c === '<' && input[i + 1] === '<' && input[i + 2] !== '<') {
      endWord();
      i += 2;
      const stripTabs = input[i] === '-';
      if (stripTabs) i++;
      while (input[i] === ' ' || input[i] === '\t') i++;
      let delimiter = '';
      while (i < input.length && !/[\s;&|()<>]/.test(input[i])) {
        if (!`'"\\`.includes(input[i])) delimiter += input[i];
        i++;
      }
      heredocs.push({ delimiter, stripTabs });
    } else if (c === '\n' && heredocs.length > 0) {
      endCommand();
      i = skipHeredocs(input, i + 1, heredocs);
      heredocs = [];
    } else if (c === '\\') {
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

const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** Reserved words that can stand before a command. */
const RESERVED = new Set([
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
]);

type Wrapper = {
  /** Its options that take the next word as their value. */
  valueOptions: string[];
  /** How many operands it takes before the command, like timeout's duration. */
  operands: number;
};

/** Commands that run the command after their own options. */
const WRAPPERS: Record<string, Wrapper> = {
  time: { valueOptions: [], operands: 0 },
  command: { valueOptions: [], operands: 0 },
  builtin: { valueOptions: [], operands: 0 },
  exec: { valueOptions: ['-a'], operands: 0 },
  nohup: { valueOptions: [], operands: 0 },
  nice: { valueOptions: ['-n'], operands: 0 },
  sudo: { valueOptions: ['-u', '-g'], operands: 0 },
  env: { valueOptions: ['-u', '-C', '-S'], operands: 0 },
  timeout: { valueOptions: ['-s', '-k'], operands: 1 },
  xargs: {
    valueOptions: ['-I', '-n', '-P', '-L', '-d', '-s', '-E', '-a'],
    operands: 0,
  },
};

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * The words of the command a simple command runs: without the reserved
 * words, variable assignments and wrappers (with their options) before it.
 */
const commandWords = (words: string[]): string[] => {
  let i = 0;
  while (i < words.length) {
    const word = words[i];
    if (RESERVED.has(word) || ASSIGNMENT.test(word)) {
      i++;
      continue;
    }
    const wrapper = Object.hasOwn(WRAPPERS, basename(word))
      ? WRAPPERS[basename(word)]
      : undefined;
    if (!wrapper) break;
    i++;
    while (i < words.length && words[i].startsWith('-')) {
      if (wrapper.valueOptions.includes(words[i])) i++;
      i++;
    }
    i += wrapper.operands;
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
const pushTarget = (refspec: string, currentBranch: () => Branch) => {
  const spec = refspec.replace(/^\+/, '');
  const colon = spec.indexOf(':');
  let target = colon === -1 ? spec : spec.slice(colon + 1);
  if (colon === -1 && (target === 'HEAD' || target === '@')) {
    target = currentBranch() ?? target;
  }
  return target.replace(/^(refs\/)?heads\//, '');
};

const checkPush = (
  args: string[],
  currentBranch: () => Branch,
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

/** The arguments before `--`, after which git reads paths, not options. */
const beforePaths = (args: string[]): string[] => {
  const end = args.indexOf('--');
  return end === -1 ? args : args.slice(0, end);
};

/** Checks one git invocation; `args` start with git's own global options. */
const checkGit = (args: string[], context: GuardrailContext): Denial | null => {
  let dir = context.cwd;
  let i = 0;
  for (; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-C') {
      dir = resolve(dir, args[++i] ?? '');
    } else if (GIT_OPTIONS_WITH_VALUE.has(arg)) {
      i++;
    } else if (!arg.startsWith('-')) {
      break;
    }
  }
  const [subcommand, ...rest] = args.slice(i);
  switch (subcommand) {
    case 'push':
      return checkPush(rest, () => context.currentBranch(dir));
    case 'reset':
      return beforePaths(rest).includes('--hard')
        ? deny('no-reset-hard')
        : null;
    case 'clean':
      return deny('no-clean');
    case 'branch':
      return checkBranch(beforePaths(rest));
    case 'commit': {
      const branch = context.currentBranch(dir);
      return branch === 'main' || branch === null
        ? deny('no-commit-off-branch')
        : null;
    }
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
    const [name, ...args] = commandWords(words);
    if (name === undefined) continue;
    const atCwd = { ...context, cwd };
    let denial: Denial | null = null;
    switch (basename(name)) {
      case 'cd':
        if (args[0] && args[0] !== '-' && !args[0].startsWith('~')) {
          cwd = resolve(cwd, args[0]);
        }
        break;
      case 'git':
        denial = checkGit(args, atCwd);
        break;
      case 'eval':
        denial = checkCommand(args.join(' '), atCwd);
        break;
      default: {
        const script = SHELLS.has(basename(name)) ? shellScript(args) : null;
        if (script !== null) denial = checkCommand(script, atCwd);
      }
    }
    if (denial) return denial;
  }
  return null;
};

/** The message a denied call gets, the same on every Agent kind. */
const denialMessage = ({ rule, reason }: Denial): string =>
  `Git guardrail (${rule}): ${reason}. This is repository policy, enforced by the PreToolUse hook in src/git-guardrail/, not a bug; do not work around it. If the work needs it, ask the User to run the command.`;

/** Parses a hook's JSON input, or null when it cannot be read. */
const parseInput = (input: string): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(input);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

/** The denial for a shell command run in `cwd`, when it reads as text. */
const denialOf = (
  command: unknown,
  cwd: unknown,
  currentBranch: GuardrailContext['currentBranch'],
): Denial | null =>
  typeof command === 'string'
    ? checkCommand(command, {
        cwd: typeof cwd === 'string' ? cwd : process.cwd(),
        currentBranch,
      })
    : null;

export type HookDecision = {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse';
    permissionDecision: 'deny';
    permissionDecisionReason: string;
  };
};

/**
 * Claude Code's adapter: the hook's answer to one PreToolUse input (JSON, as
 * Claude Code sends it on stdin): a denial, or null to leave the decision to
 * the permission mode. Input it cannot read is left alone rather than
 * blocking every command.
 */
export const hookDecision = (
  input: string,
  currentBranch: GuardrailContext['currentBranch'],
): HookDecision | null => {
  const parsed = parseInput(input);
  if (parsed?.tool_name !== 'Bash') return null;
  const command = (parsed.tool_input as { command?: unknown } | undefined)
    ?.command;
  const denial = denialOf(command, parsed.cwd, currentBranch);
  if (!denial) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: denialMessage(denial),
    },
  };
};

export type CopilotHookDecision = {
  permissionDecision: 'deny';
  permissionDecisionReason: string;
};

/**
 * Copilot's adapter (T1396): the answer to one `preToolUse` input of a
 * Copilot command hook (`.github/hooks/git-guardrail.json`), whose shell tool
 * is `bash` and whose `toolArgs` is the arguments' JSON text. A denial, or
 * null to leave the decision to Copilot's permissions.
 */
export const copilotHookDecision = (
  input: string,
  currentBranch: GuardrailContext['currentBranch'],
): CopilotHookDecision | null => {
  const parsed = parseInput(input);
  if (parsed?.toolName !== 'bash') return null;
  const args =
    typeof parsed.toolArgs === 'string'
      ? parseInput(parsed.toolArgs)
      : parsed.toolArgs;
  const command = (args as { command?: unknown } | null | undefined)?.command;
  const denial = denialOf(command, parsed.cwd, currentBranch);
  if (!denial) return null;
  return {
    permissionDecision: 'deny',
    permissionDecisionReason: denialMessage(denial),
  };
};

/** `git symbolic-ref -q` exits 1 on a detached HEAD, 128 outside a repository. */
export const gitBranch = (dir: string): Branch => {
  try {
    const branch = execFileSync(
      'git',
      ['-C', dir, 'symbolic-ref', '--short', '-q', 'HEAD'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return branch === '' ? undefined : branch;
  } catch (error) {
    return (error as { status?: unknown }).status === 1 ? null : undefined;
  }
};

// Claude Code runs the hook as is; Copilot's hook passes `--copilot`.
if (import.meta.main) {
  const adapter = process.argv.includes('--copilot')
    ? copilotHookDecision
    : hookDecision;
  const decision = adapter(readFileSync(0, 'utf8'), gitBranch);
  if (decision) process.stdout.write(JSON.stringify(decision));
}
