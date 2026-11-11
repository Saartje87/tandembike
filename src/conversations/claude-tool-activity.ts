import type { ToolActivity } from './tool-activity';

type ToolInput = Record<string, unknown>;

const stringOf = (input: ToolInput, key: string): string | undefined => {
  const value = input[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const baseName = (path: string) =>
  path.split('/').filter(Boolean).pop() ?? path;

const fileOf = (input: ToolInput) => {
  const path = stringOf(input, 'file_path') ?? stringOf(input, 'path');
  return path ? baseName(path) : undefined;
};

const action = (verb: string, target: string | undefined): ToolActivity =>
  target === undefined ? { verb } : { verb, target };

/** Claude Code's built-in tools: a verb and the input that is its target. */
const builtIn: Record<string, (input: ToolInput) => ToolActivity> = {
  Read: (i) => action('Reading', fileOf(i)),
  Edit: (i) => action('Editing', fileOf(i)),
  MultiEdit: (i) => action('Editing', fileOf(i)),
  Write: (i) => action('Writing', fileOf(i)),
  Grep: (i) => action('Searching', stringOf(i, 'pattern')),
  Glob: (i) => action('Finding', stringOf(i, 'pattern')),
  Bash: (i) =>
    action('Running', stringOf(i, 'description') ?? stringOf(i, 'command')),
  Skill: (i) => action('Using', stringOf(i, 'skill')),
  Agent: (i) => action('Delegating', stringOf(i, 'description')),
  WebFetch: (i) => action('Fetching', stringOf(i, 'url')),
  WebSearch: (i) => action('Searching', stringOf(i, 'query')),
};

const tandembikePrefix = 'mcp__tandembike__';

/**
 * What a Claude Code tool call does, for the status line (T1066, ADR 0051):
 * the Claude runner's map from its tool names to the status line's verbs,
 * the only place they are read. A Tandembike tool keeps its own name; any
 * other tool reads as its name and its first text input.
 */
export function claudeToolActivity(
  name: string,
  input: ToolInput,
): ToolActivity {
  const known = builtIn[name];
  if (known) {
    return known(input);
  }
  if (name.startsWith(tandembikePrefix)) {
    const number = input.number;
    return typeof number === 'number'
      ? {
          tandembike: name.slice(tandembikePrefix.length),
          ticketNumber: number,
        }
      : { tandembike: name.slice(tandembikePrefix.length) };
  }
  const first = Object.values(input).find(
    (value): value is string => typeof value === 'string' && value !== '',
  );
  return action(name, first);
}
