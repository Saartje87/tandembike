import { playbookPath } from '../playbook/playbook';

/**
 * The CLI's decisions for terminal sessions (ADR 0039): what a `tandembike`
 * command means, and how `claude` is opened. Pure; `cli.ts` only does the I/O.
 */

export const usageText = [
  'Usage:',
  '  tandembike                    start the server',
  '  tandembike start <ticket>     work a Ticket in this terminal (T42 or 42)',
  '  tandembike resume <conversation>  continue a Conversation in this terminal',
  '  tandembike mcp                register the MCP server with Claude Code',
].join('\n');

export type ParsedCommand =
  | { command: 'server'; args: string[] }
  | { command: 'mcp' }
  | { command: 'start'; ticketNumber: number }
  | { command: 'resume'; conversationId: number }
  | { command: 'usage'; text: string };

const usage: ParsedCommand = { command: 'usage', text: usageText };

/** A Ticket as typed, `T42` or `42`; null for anything else. */
const ticketNumberOf = (text: string | undefined): number | null => {
  const match = /^T?(\d+)$/i.exec(text ?? '');
  const number = match ? Number(match[1]) : 0;
  return number > 0 ? number : null;
};

/**
 * What `tandembike <argv>` does. No subcommand (or only flags) starts the
 * server with those arguments; other subcommands are added here, one per
 * Stage the terminal can open.
 */
export function parseCommand(argv: string[]): ParsedCommand {
  const [first, ...rest] = argv;
  if (first === undefined || first.startsWith('-')) {
    return { command: 'server', args: argv };
  }
  if (first === 'mcp') {
    return rest.length === 0 ? { command: 'mcp' } : usage;
  }
  if (first === 'start') {
    const ticketNumber = ticketNumberOf(rest[0]);
    return rest.length === 1 && ticketNumber !== null
      ? { command: 'start', ticketNumber }
      : usage;
  }
  if (first === 'resume') {
    const match = /^(\d+)$/.exec(rest[0] ?? '');
    const conversationId = match ? Number(match[1]) : 0;
    return rest.length === 1 && conversationId > 0
      ? { command: 'resume', conversationId }
      : usage;
  }
  return usage;
}

/** What the server returns for a started Terminal Conversation. */
export type TerminalStartResult = {
  conversationId: number;
  cwd: string;
  firstMessage: string;
  brief: string;
  runMode: 'default' | 'auto';
  model: string | null;
};

/** What the server returns for a Conversation handed over to the terminal. */
export type TerminalResumeResult = Omit<TerminalStartResult, 'firstMessage'> & {
  /** The SDK session `claude --resume` opens. */
  sessionId: string;
};

export type ClaudeSessionPlan = {
  command: 'claude';
  cwd: string;
  args: string[];
  /** Added to the environment `claude` inherits. */
  env: Record<string, string>;
};

/**
 * The `claude` that a Terminal Conversation opens (ADR 0039): the bundled
 * Playbook always wins over a user-scope copy, the brief is appended to the
 * system prompt, the Project's run mode and model apply, and the first
 * message is the prompt. `TANDEMBIKE_RUN` attributes the session's MCP calls
 * to its Conversation.
 */
export function planClaudeSession(
  result: TerminalStartResult | TerminalResumeResult,
  playbookDir: string = playbookPath,
): ClaudeSessionPlan {
  return {
    command: 'claude',
    cwd: result.cwd,
    args: [
      ...('sessionId' in result ? ['--resume', result.sessionId] : []),
      '--plugin-dir',
      playbookDir,
      '--append-system-prompt',
      result.brief,
      '--permission-mode',
      result.runMode,
      ...(result.model === null ? [] : ['--model', result.model]),
      ...('firstMessage' in result ? [result.firstMessage] : []),
    ],
    env: { TANDEMBIKE_RUN: String(result.conversationId) },
  };
}
