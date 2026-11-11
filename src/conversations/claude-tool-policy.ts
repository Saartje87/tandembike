import type { ToolPolicy } from './agent-runner';

/**
 * A tool policy in Claude Code's tool names (ADR 0051), the only place they
 * are named for restrictions. Passed to the SDK as `disallowedTools`.
 */
const disallowed: Record<ToolPolicy, readonly string[]> = {
  /**
   * A Spar, whatever the run mode (ADR 0046): file edits and every Tandembike
   * tool that creates or changes Tickets or Cycles. Reading, the Widget tools
   * and the Spar tools stay.
   */
  'read-only': [
    'Edit',
    'Write',
    'NotebookEdit',
    'mcp__tandembike__file_tickets',
    'mcp__tandembike__update_ticket',
    'mcp__tandembike__start_work',
    'mcp__tandembike__finish_work',
    'mcp__tandembike__abandon_work',
    'mcp__tandembike__open_pr',
    'mcp__tandembike__add_note',
    'mcp__tandembike__check_criterion',
    'mcp__tandembike__attach',
    'mcp__tandembike__propose_triage',
    'mcp__tandembike__create_cycle',
    'mcp__tandembike__update_cycle',
  ],
  /**
   * An Autopilot Triage run and every Batch triage run: their only writes
   * are a proposal and a note (ADR 0040, ADR 0047).
   */
  'no-ticket-writes': [
    'mcp__tandembike__update_ticket',
    'mcp__tandembike__file_tickets',
  ],
};

/** The Claude Code tools a run under `policy` may not use. */
export const claudeDisallowedTools = (policy: ToolPolicy): string[] => [
  ...disallowed[policy],
];
