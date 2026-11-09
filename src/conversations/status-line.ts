import type { TranscriptRole } from './conversation-state';

/** The part of a transcript entry the status line is made from. */
export type StatusEntry = {
  role: TranscriptRole;
  text: string;
  permissionRules: string[] | null;
  /** The tool's name and input; null for older entries, and no input when over the cap. */
  toolName?: string | null;
  toolInput?: Record<string, unknown> | null;
};

type ToolInput = Record<string, unknown>;

const tandembikePrefix = 'mcp__tandembike__';

/**
 * Parses the input of a tool entry. The stored text is cut to 300 characters,
 * so the JSON may be incomplete: then the string and number values that are
 * there are read one by one, the last string even if it is cut.
 */
const parseInput = (json: string): ToolInput => {
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ToolInput;
    }
    return {};
  } catch {
    const input: ToolInput = {};
    for (const match of json.matchAll(
      /"(\w+)"\s*:\s*(?:"((?:[^"\\]|\\.)*)("|$)|(-?\d+))/g,
    )) {
      const [, key, text, , number] = match;
      if (text !== undefined) {
        try {
          input[key] = JSON.parse(`"${text}"`);
        } catch {
          input[key] = text;
        }
      } else {
        input[key] = Number(number);
      }
    }
    return input;
  }
};

const stringOf = (input: ToolInput, key: string): string | undefined => {
  const value = input[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const firstLine = (text: string) => text.trim().split('\n')[0].trim();

const baseName = (path: string) =>
  path.split('/').filter(Boolean).pop() ?? path;

const withTarget = (verb: string, target: string | undefined) =>
  target ? `${verb} ${target}` : verb;

/** Built-in tools: a verb and the input that is its target. */
const builtIn: Record<string, (input: ToolInput) => string> = {
  Read: (i) => withTarget('Reading', fileOf(i)),
  Edit: (i) => withTarget('Editing', fileOf(i)),
  MultiEdit: (i) => withTarget('Editing', fileOf(i)),
  Write: (i) => withTarget('Writing', fileOf(i)),
  Grep: (i) => withTarget('Searching', stringOf(i, 'pattern')),
  Glob: (i) => withTarget('Finding', stringOf(i, 'pattern')),
  Bash: (i) =>
    withTarget('Running', stringOf(i, 'description') ?? stringOf(i, 'command')),
  Skill: (i) => withTarget('Using', stringOf(i, 'skill')),
  Agent: (i) => withTarget('Delegating', stringOf(i, 'description')),
  WebFetch: (i) => withTarget('Fetching', stringOf(i, 'url')),
  WebSearch: (i) => withTarget('Searching', stringOf(i, 'query')),
};

const fileOf = (input: ToolInput) => {
  const path = stringOf(input, 'file_path') ?? stringOf(input, 'path');
  return path ? baseName(path) : undefined;
};

/**
 * The Tandembike tools: the line with `{T}` for the Ticket number, and the
 * line to use when the input names none.
 */
const tandembike: Record<string, [line: string, without: string]> = {
  next_work: ['Finding the next work', 'Finding the next work'],
  start_work: ['Starting {T}', 'Starting a Ticket'],
  add_note: ['Commenting on {T}', 'Commenting'],
  propose_triage: ['Proposing triage for {T}', 'Proposing triage'],
  check_criterion: ['Checking criteria of {T}', 'Checking criteria'],
  open_pr: ['Linking a pull request to {T}', 'Linking a pull request'],
  finish_work: ['Finishing {T}', 'Finishing a Ticket'],
  abandon_work: ['Giving up {T}', 'Giving up a Ticket'],
  file_tickets: ['Creating Tickets', 'Creating Tickets'],
  find_tickets: ['Listing Tickets', 'Listing Tickets'],
  attach: ['Attaching a file to {T}', 'Attaching a file'],
  read_attachment: ['Reading an attachment of {T}', 'Reading an attachment'],
  get_project: ['Reading a Project', 'Reading a Project'],
  get_ticket: ['Reading {T}', 'Reading a Ticket'],
  update_ticket: ['Updating {T}', 'Updating a Ticket'],
  create_cycle: ['Creating a Cycle', 'Creating a Cycle'],
};

const humanise = (name: string) => {
  const words = name.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const toolLine = (name: string, input: ToolInput): string => {
  const builtInLine = builtIn[name];
  if (builtInLine) {
    return builtInLine(input);
  }
  if (name.startsWith(tandembikePrefix)) {
    const tool = name.slice(tandembikePrefix.length);
    const entry = tandembike[tool];
    if (!entry) {
      return humanise(tool);
    }
    const number = input.number;
    return typeof number === 'number'
      ? entry[0].replace('{T}', `T${number}`)
      : entry[1];
  }
  const first = Object.values(input).find(
    (value): value is string => typeof value === 'string' && value !== '',
  );
  return withTarget(name, first);
};

const splitTool = (text: string): [name: string, input: string] => {
  const space = text.indexOf(' ');
  return space === -1
    ? [text, '']
    : [text.slice(0, space), text.slice(space + 1)];
};

const firstSentence = (text: string) => {
  const flat = text.trim().replace(/\s+/g, ' ');
  return flat.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? firstLine(text);
};

/**
 * The status line for a Conversation's latest transcript entry: what the Agent
 * is doing now, in a few words (T1066). `null` is a run that has written
 * nothing yet.
 */
export function statusLine(entry: StatusEntry | null): string {
  if (!entry) {
    return 'Starting';
  }
  switch (entry.role) {
    case 'tool': {
      if (entry.toolName && entry.toolInput) {
        return toolLine(entry.toolName, entry.toolInput);
      }
      const [name, input] = splitTool(entry.text);
      return toolLine(entry.toolName ?? name, parseInput(input));
    }
    case 'agent':
      return firstSentence(entry.text);
    case 'permission':
      return (
        entry.permissionRules?.[0] ?? entry.toolName ?? splitTool(entry.text)[0]
      );
    case 'question':
    case 'error':
    case 'created':
      return firstLine(entry.text);
    default:
      return 'Starting';
  }
}
