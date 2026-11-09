import { playbookPath } from '../playbook/playbook';

/**
 * The CLI's decisions for terminal sessions (ADR 0039): what a `tandembike`
 * command means, and how `claude` is opened. Pure; `cli.ts` only does the I/O.
 */

export const usageText = [
  'Usage:',
  '  tandembike                    start the server',
  '  tandembike start <ticket>     work a Ticket in this terminal (T42 or 42)',
  '  tandembike triage <ticket>    triage a Ticket in this terminal',
  '  tandembike spec <ticket>      spec an idea or an empty Epic in this terminal',
  '  tandembike next               start the next Eligible item of this Project',
  '  tandembike mcp                register the MCP server with Claude Code',
].join('\n');

export type ParsedCommand =
  | { command: 'server'; args: string[] }
  | { command: 'mcp' }
  | { command: 'start'; ticketNumber: number }
  | { command: 'triage'; ticketNumber: number }
  | { command: 'spec'; ticketNumber: number }
  | { command: 'next' }
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
  if (first === 'next') {
    return rest.length === 0 ? { command: 'next' } : usage;
  }
  if (first === 'start' || first === 'triage' || first === 'spec') {
    const ticketNumber = ticketNumberOf(rest[0]);
    return rest.length === 1 && ticketNumber !== null
      ? ({ command: first, ticketNumber } as ParsedCommand)
      : usage;
  }
  return usage;
}

/** What `tandembike next` prints when `next_work` finds nothing (T1240). */
export function noWorkMessage(
  reason: 'no-active-cycle' | 'nothing-ready' | 'all-blocked-or-claimed',
): string {
  switch (reason) {
    case 'no-active-cycle':
      return 'There is no Active Cycle in this Project, so there is no work to start.';
    case 'nothing-ready':
      return 'Nothing in the Active Cycle is ready: a Todo Ticket labelled ready-for-agent, outside an Epic, is needed.';
    case 'all-blocked-or-claimed':
      return 'Every ready item in the Active Cycle is blocked or claimed.';
  }
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
  result: TerminalStartResult,
  playbookDir: string = playbookPath,
): ClaudeSessionPlan {
  return {
    command: 'claude',
    cwd: result.cwd,
    args: [
      '--plugin-dir',
      playbookDir,
      '--append-system-prompt',
      result.brief,
      '--permission-mode',
      result.runMode,
      ...(result.model === null ? [] : ['--model', result.model]),
      result.firstMessage,
    ],
    env: { TANDEMBIKE_RUN: String(result.conversationId) },
  };
}
