import type { ToolPolicy } from './agent-runner';

/**
 * The Tandembike MCP tools each tool policy keeps a run from using, by their
 * own names (ADR 0046, ADR 0051): the one list every runner translates into
 * its agent's tool names, so a new writing tool is excluded on all of them.
 */
export const blockedTandembikeTools: Record<ToolPolicy, readonly string[]> = {
  /**
   * A Spar, whatever the run mode: every tool that creates or changes
   * Tickets or Cycles. Reading, the Widget tools and the Spar tools stay.
   */
  'read-only': [
    'file_tickets',
    'update_ticket',
    'start_work',
    'finish_work',
    'abandon_work',
    'open_pr',
    'add_note',
    'check_criterion',
    'attach',
    'propose_triage',
    'create_cycle',
    'update_cycle',
  ],
  /**
   * An Autopilot Triage run and every Batch triage run: their only writes
   * are a proposal and a note (ADR 0040, ADR 0047).
   */
  'no-ticket-writes': ['update_ticket', 'file_tickets'],
};
