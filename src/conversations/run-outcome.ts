import type { Status } from '../tickets/status';
import type { ConversationIntent } from './conversation-state';

/** How a run ended (GLOSSARY: Run outcome). */
export const runResults = [
  'completed',
  'pr_open',
  'needs_reply',
  'abandoned',
  'stopped',
  'failed_transient',
  'failed',
] as const;
export type RunResult = (typeof runResults)[number];

export type RunEnd = {
  /** The User stopped the run. */
  stopped: boolean;
  /** The error the end carries, if any. */
  error: string | undefined;
  /**
   * The runner's verdict that the error is worth resuming, such as an
   * overload or a network error (ADR 0034, ADR 0051).
   */
  transient: boolean;
  /** The Conversation's Ticket Status; null for a Conversation without one. */
  ticketStatus: Status | null;
  /** The Ticket, or its Epic, has a PR reference. */
  hasPullRequest: boolean;
  /** The run ended with a permission request or a Widget still unanswered. */
  waitingOnUser: boolean;
  intent: ConversationIntent;
};

/**
 * Stages whose work never ends in Done or a PR: a clean end of one, not
 * waiting on the User, is its completion. A Start and a Merge end in Done or
 * a PR; a Spar answers the User turn by turn.
 */
const completesOnCleanEnd: ReadonlySet<ConversationIntent> = new Set([
  'triage',
  'spec',
  'plan',
  'retro',
  'ask',
  'new_ticket',
  'setup',
  'batch_triage',
]);

/** The result of a run end, first match wins (GLOSSARY: Run outcome). */
export function runResultOf(end: RunEnd): RunResult {
  if (end.stopped) {
    return 'stopped';
  }
  if (end.error !== undefined) {
    return end.transient ? 'failed_transient' : 'failed';
  }
  if (end.ticketStatus === 'Done') {
    return 'completed';
  }
  if (end.ticketStatus !== null && end.hasPullRequest) {
    return 'pr_open';
  }
  if (end.intent === 'start' && end.ticketStatus === 'Todo') {
    return 'abandoned';
  }
  if (completesOnCleanEnd.has(end.intent) && !end.waitingOnUser) {
    return 'completed';
  }
  return 'needs_reply';
}
