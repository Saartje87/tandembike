import type { ToolActivity } from './tool-activity';

type ToolInput = Record<string, unknown>;

const stringOf = (input: ToolInput, key: string): string | undefined => {
  const value = input[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const baseName = (path: string) =>
  path.split('/').filter(Boolean).pop() ?? path;

const fileOf = (input: ToolInput) => {
  const path = stringOf(input, 'path') ?? stringOf(input, 'file_path');
  return path ? baseName(path) : undefined;
};

const action = (verb: string, target: string | undefined): ToolActivity =>
  target === undefined ? { verb } : { verb, target };

/** Copilot's built-in tools, as T597 saw them: a verb and its target. */
const builtIn: Record<string, (input: ToolInput) => ToolActivity> = {
  view: (i) => action('Reading', fileOf(i)),
  edit: (i) => action('Editing', fileOf(i)),
  create: (i) => action('Writing', fileOf(i)),
  grep: (i) => action('Searching', stringOf(i, 'pattern')),
  glob: (i) => action('Finding', stringOf(i, 'pattern')),
  bash: (i) =>
    action('Running', stringOf(i, 'description') ?? stringOf(i, 'command')),
  skill: (i) => action('Using', stringOf(i, 'skill')),
  task: (i) => action('Delegating', stringOf(i, 'description')),
  web_fetch: (i) => action('Fetching', stringOf(i, 'url')),
};

/** A Copilot tool call as `tool.execution_start` reports it. */
export type CopilotToolCall = {
  toolName: string;
  mcpServerName?: string;
  mcpToolName?: string;
  input: ToolInput;
};

/**
 * What a Copilot tool call does, for the status line (T1066, ADR 0051): the
 * Copilot runner's map from its tool names to the status line's verbs. A
 * Tandembike tool keeps its own name; any other tool reads as its name and
 * its first text input.
 */
export function copilotToolActivity({
  toolName,
  mcpServerName,
  mcpToolName,
  input,
}: CopilotToolCall): ToolActivity {
  if (mcpServerName === 'tandembike' && mcpToolName) {
    const number = input.number;
    return typeof number === 'number'
      ? { tandembike: mcpToolName, ticketNumber: number }
      : { tandembike: mcpToolName };
  }
  const known = builtIn[toolName];
  if (known) {
    return known(input);
  }
  const first = Object.values(input).find(
    (value): value is string => typeof value === 'string' && value !== '',
  );
  return action(toolName, first);
}
