import type { ConversationState } from './conversation-state';
import { type StatusEntry, statusLine } from './status-line';

/**
 * What a Ticket's live Conversation is doing, for the Board's lanes and the
 * status line on its card.
 * `running` and `waiting` are live; `interrupted` and `error` (an idle or
 * interrupted Conversation whose latest entry is an error) need the User.
 */
export type LiveConversation = {
  state: 'running' | 'waiting' | 'interrupted' | 'error';
  /** The status line: what the Conversation is doing now (T1066). */
  line: string;
  /** When the current run started, as an ISO string. */
  since: string;
  /** What this Conversation has cost so far in USD: the running cost. */
  cost: number;
};

export type ConversationActivity = {
  /** Per Ticket number, its newest live Conversation; none for idle/stopped. */
  live: Record<number, LiveConversation>;
  /**
   * Per Ticket number, the USD cost summed over all its Conversations, closed
   * ones included. Tickets that cost nothing are left out.
   */
  cost: Record<number, number>;
  /** Tickets with a Conversation whose Agent is working. */
  running: number[];
  /** Tickets with a Conversation that waits for a permission or a reply. */
  needsYou: number[];
  /** How many Conversations wait for the User, on Tickets or Projects. */
  needsYouCount: number;
  /** The same count per Project id. */
  needsYouByProject: Record<number, number>;
};

export const noConversationActivity: ConversationActivity = {
  live: {},
  cost: {},
  running: [],
  needsYou: [],
  needsYouCount: 0,
  needsYouByProject: {},
};

export type ActivityRow = {
  ticketNumber: number | null;
  projectId: number;
  state: ConversationState;
  /** The Conversation's latest transcript entry, null if none. */
  latest: StatusEntry | null;
  /** When the current run started, as an ISO string. */
  startedAt: string;
  /** What the Conversation has cost in USD, 0 if nothing yet. */
  costUsd: number;
};

const liveStateOf = (row: ActivityRow): LiveConversation['state'] | null => {
  if (row.state === 'running' || row.state === 'waiting') {
    return row.state;
  }
  if (row.state === 'idle' || row.state === 'interrupted') {
    if (row.latest?.role === 'error') {
      return 'error';
    }
    return row.state === 'interrupted' ? 'interrupted' : null;
  }
  return null;
};

const liveOf = (rows: ActivityRow[]): Record<number, LiveConversation> => {
  const live: Record<number, LiveConversation> = {};
  // Rows are newest first: the first one with a state wins.
  for (const row of rows) {
    const state = liveStateOf(row);
    if (row.ticketNumber !== null && state && !(row.ticketNumber in live)) {
      live[row.ticketNumber] = {
        state,
        line: statusLine(row.latest),
        since: row.startedAt,
        cost: row.costUsd,
      };
    }
  }
  return live;
};

/** Whether a Conversation in this state waits for the User (T593). */
export const needsYou = (state: ConversationState) =>
  state === 'waiting' || state === 'idle';

const ticketsOf = (rows: ActivityRow[]): number[] => [
  ...new Set(
    rows.flatMap(({ ticketNumber }) =>
      ticketNumber === null ? [] : [ticketNumber],
    ),
  ),
];

const costOf = (rows: ActivityRow[]): Record<number, number> => {
  const cost: Record<number, number> = {};
  for (const { ticketNumber, costUsd } of rows) {
    if (ticketNumber !== null && costUsd > 0) {
      cost[ticketNumber] = (cost[ticketNumber] ?? 0) + costUsd;
    }
  }
  return cost;
};

const countBy = (ids: number[]): Record<number, number> => {
  const counts: Record<number, number> = {};
  for (const id of ids) {
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
};

/** What the Conversations are doing, for the Ticket cards and the header. */
export function conversationActivity(
  conversations: ActivityRow[],
): ConversationActivity {
  const waiting = conversations.filter(({ state }) => needsYou(state));
  return {
    live: liveOf(conversations),
    cost: costOf(conversations),
    running: ticketsOf(
      conversations.filter(({ state }) => state === 'running'),
    ),
    needsYou: ticketsOf(waiting),
    needsYouCount: waiting.length,
    needsYouByProject: countBy(waiting.map(({ projectId }) => projectId)),
  };
}
