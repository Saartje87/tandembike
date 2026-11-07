import type { ConversationState } from './conversation-state';
import { type StatusEntry, statusLine } from './status-line';

/**
 * What a Ticket's live Conversation is doing, for the Board's lanes and the
 * status line on its card.
 * `running` and `waiting` are live; `interrupted` and `error` (an idle or
 * interrupted Conversation whose latest entry is an error) need the User.
 */
export type LiveConversation = {
  /** The Conversation's id, to open it in the Conversation dialog. */
  conversationId: number;
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
  waiting: number[];
  /** How many Conversations wait for the User, on Tickets or Projects. */
  waitingCount: number;
  /** The same count per Project id. */
  waitingByProject: Record<number, number>;
};

export const noConversationActivity: ConversationActivity = {
  live: {},
  cost: {},
  running: [],
  waiting: [],
  waitingCount: 0,
  waitingByProject: {},
};

export type ActivityRow = {
  /** The Conversation's id. */
  id: number;
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

const isLive = (row: ActivityRow) =>
  row.state === 'running' || row.state === 'waiting';

/** The state of a Conversation that needs the User though it is not live. */
const stoppedStateOf = (row: ActivityRow): LiveConversation['state'] | null => {
  if (row.state !== 'idle' && row.state !== 'interrupted') {
    return null;
  }
  if (row.latest?.role === 'error') {
    return 'error';
  }
  return row.state === 'interrupted' ? 'interrupted' : null;
};

const liveOf = (rows: ActivityRow[]): Record<number, LiveConversation> => {
  const live: Record<number, LiveConversation> = {};
  const show = (
    row: ActivityRow,
    ticketNumber: number,
    state: LiveConversation['state'],
  ) => {
    live[ticketNumber] = {
      conversationId: row.id,
      state,
      line: statusLine(row.latest),
      since: row.startedAt,
      cost: row.costUsd,
    };
  };
  // Rows are newest first. A running or waiting Conversation anywhere is
  // live, the newest winning; an interrupted or errored one counts only as
  // the Ticket's newest Conversation, so a clean newer run clears it.
  for (const row of rows) {
    if (
      row.ticketNumber !== null &&
      isLive(row) &&
      !(row.ticketNumber in live)
    ) {
      show(row, row.ticketNumber, row.state as 'running' | 'waiting');
    }
  }
  const seen = new Set<number>();
  for (const row of rows) {
    if (row.ticketNumber === null || seen.has(row.ticketNumber)) {
      continue;
    }
    seen.add(row.ticketNumber);
    const state = stoppedStateOf(row);
    if (state && !(row.ticketNumber in live)) {
      show(row, row.ticketNumber, state);
    }
  }
  return live;
};

/** Whether a Conversation in this state waits for the User (T593). */
export const waitsOnUser = (state: ConversationState) =>
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
  const waiting = conversations.filter(({ state }) => waitsOnUser(state));
  return {
    live: liveOf(conversations),
    cost: costOf(conversations),
    running: ticketsOf(
      conversations.filter(({ state }) => state === 'running'),
    ),
    waiting: ticketsOf(waiting),
    waitingCount: waiting.length,
    waitingByProject: countBy(waiting.map(({ projectId }) => projectId)),
  };
}
