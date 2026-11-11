import { claudeToolActivity } from './claude-tool-activity';
import type { TranscriptRole } from './conversation-state';
import { activityLine, type ToolActivity } from './tool-activity';

/** The part of a transcript entry the status line is made from. */
export type StatusEntry = {
  role: TranscriptRole;
  text: string;
  permissionRules: string[] | null;
  /** The tool's name and input; null for older entries, and no input when over the cap. */
  toolName?: string | null;
  toolInput?: Record<string, unknown> | null;
  /** What the tool did, as its runner mapped it (ADR 0051); null for older entries. */
  toolActivity?: ToolActivity | null;
};

type ToolInput = Record<string, unknown>;

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

const firstLine = (text: string) => text.trim().split('\n')[0].trim();

const splitTool = (text: string): [name: string, input: string] => {
  const space = text.indexOf(' ');
  return space === -1
    ? [text, '']
    : [text.slice(0, space), text.slice(space + 1)];
};

/**
 * The activity of an entry recorded before tool events carried one (T1372):
 * every such entry is Claude Code's, so its runner's map reads it, from the
 * tool name and input, or from the stored `Name {json}` text.
 */
const olderActivity = (entry: StatusEntry): ToolActivity => {
  if (entry.toolName && entry.toolInput) {
    return claudeToolActivity(entry.toolName, entry.toolInput);
  }
  const [name, input] = splitTool(entry.text);
  return claudeToolActivity(entry.toolName ?? name, parseInput(input));
};

/**
 * A tool entry worded as on the Board cards, such as "Editing a.ts" (T1066),
 * from the activity its runner reported. The chat uses it for its steps too
 * (T1386).
 */
export function toolPhrase(entry: StatusEntry): string {
  return activityLine(entry.toolActivity ?? olderActivity(entry));
}

/** A tool entry's input as stored: its text after the tool name, already capped. */
export function toolRawInput(text: string): string {
  return splitTool(text)[1];
}

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
    case 'tool':
      return toolPhrase(entry);
    case 'agent':
      return firstSentence(entry.text);
    case 'permission':
      return (
        entry.permissionRules?.[0] ?? entry.toolName ?? splitTool(entry.text)[0]
      );
    case 'question':
    case 'widget':
    case 'error':
    case 'created':
      return firstLine(entry.text);
    default:
      return 'Starting';
  }
}

/** The roles of the entries that are a message to the User (T1262). */
export const messageRoles = [
  'agent',
  'question',
  'widget',
  'permission',
  'error',
] as const satisfies readonly TranscriptRole[];

/**
 * The line for a Conversation that is not running: the Agent's latest
 * message, what it said or asks, on one line (T1262). A permission request
 * reads as its rule, as on the status line. Empty without a message.
 */
export function messageLine(entry: StatusEntry | null): string {
  if (!entry) {
    return '';
  }
  if (entry.role === 'permission') {
    return statusLine(entry);
  }
  return entry.text.trim().replace(/\s+/g, ' ');
}
