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

const transientMarkers = [
  /\b529\b/,
  /overloaded/,
  /\b429\b/,
  /rate[_ ]limit/,
  /\b5\d\d\b/,
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
  /** The Conversation's Ticket Status; null for a Conversation without one. */
  ticketStatus: Status | null;
  /** The Ticket, or its Epic, has a PR reference. */
  hasPullRequest: boolean;
  intent: ConversationIntent;
};

/** The result of a run end, first match wins (GLOSSARY: Run outcome). */
export function runResultOf(end: RunEnd): RunResult {
  if (end.stopped) {
    return 'stopped';
  }
  if (end.error !== undefined) {
    return classifyRunError(end.error) === 'transient'
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
  return 'needs_reply';
}
