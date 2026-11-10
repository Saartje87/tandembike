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

/**
 * A 429 or 5xx counts only as an HTTP status: after `API Error:`, `status`,
 * `status code` or `HTTP`, or as the whole text's leading code, so a port or
 * a count in a message does not match.
 */
const statusMarker =
  /(?:^\s*|(?:api error|status(?: code)?|http(?:\/[\d.]+)?):?\s*)(?:429|5\d\d)\b/;

const transientMarkers = [
  statusMarker,
  /overloaded/,
  /rate[_ ]limit/,
  /api_error/,
  /econnreset/,
  /etimedout/,
  /enotfound/,
  /fetch failed/,
  /socket hang up/,
];

/**
 * Whether a run's error is worth resuming: an API overload, rate limit,
 * server error or network error is transient; every other error, including
 * `error_max_turns` and `error_during_execution`, is substantive. Reads the
 * error text and the SDK's result subtype.
 */
export function classifyRunError(
  error: string,
  subtype = '',
): 'transient' | 'substantive' {
  const text = `${error} ${subtype}`.toLowerCase();
  return transientMarkers.some((marker) => marker.test(text))
    ? 'transient'
    : 'substantive';
}

export type RunEnd = {
  /** The User stopped the run. */
  stopped: boolean;
  /** The error the end carries, if any. */
  error: string | undefined;
  /** The SDK result subtype that came with the error, if any. */
  errorSubtype?: string;
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
]);

/** The result of a run end, first match wins (GLOSSARY: Run outcome). */
export function runResultOf(end: RunEnd): RunResult {
  if (end.stopped) {
    return 'stopped';
  }
  if (end.error !== undefined) {
    return classifyRunError(end.error, end.errorSubtype) === 'transient'
      ? 'failed_transient'
      : 'failed';
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
