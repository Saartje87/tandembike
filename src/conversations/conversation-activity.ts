import {
  type ConversationStarter,
  type ConversationState,
  isTerminal,
} from './conversation-state';
import { messageLine, type StatusEntry, statusLine } from './status-line';

/**
 * What a Ticket's live Conversation is doing, for the Board's lanes and the
 * status line on its card.
 * `running` and `waiting` are live; `interrupted` and `error` (an idle or
 * interrupted Conversation whose latest entry is an error) need the User.
 */
export type LiveConversation = {
  /** The Conversation's id, to open it in the Conversation dialog. */
  conversationId: number;
  state: 'running' | 'waiting' | 'idle' | 'interrupted' | 'error';
  /**
   * While running, the status line: what the Conversation is doing now
   * (T1066). Otherwise the Agent's latest message: what it said or asks
   * (T1262).
   */
  line: string;
  /** When the current run started, as an ISO string. */
  since: string;
  /** What this Conversation has cost so far in USD: the running cost. */
  cost: number;
  /** Whether it runs in a terminal; Tandembike sees no cost of such a run (ADR 0039). */
  terminal: boolean;
};

export type ConversationActivity = {
  /**
   * Per Ticket number, its running or waiting Conversation, else its newest
   * Conversation when that one is idle or interrupted (an error when it ended
   * in one); none otherwise.
   */
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
  /** Its latest entry that is a message to the User, null if none (T1262). */
  message: StatusEntry | null;
  /** When the current run started, as an ISO string. */
  startedAt: string;
  /** What the Conversation has cost in USD, 0 if nothing yet. */
  costUsd: number;
  /** Who started it. */
  startedBy: ConversationStarter;
  /**
   * A Batch triage's listed Tickets: while its run works, each shows it as a
   * Triage run shows on its own Ticket (T1319). Null or left out otherwise.
   */
  batchTriageTickets?: number[] | null;
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
  return row.state;
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
      line:
        state === 'running' ? statusLine(row.latest) : messageLine(row.message),
      since: row.startedAt,
      cost: row.costUsd,
      terminal: isTerminal(row),
    };
  };
  // Rows are newest first. A running or waiting Conversation anywhere is
  // live, the newest winning, on its Ticket or on each Ticket a Batch triage
  // lists; an interrupted or errored one counts only as the Ticket's newest
  // Conversation, so a clean newer run clears it.
  for (const row of rows) {
    if (!isLive(row)) {
      continue;
    }
    const numbers =
      row.ticketNumber === null
        ? (row.batchTriageTickets ?? [])
        : [row.ticketNumber];
    for (const number of numbers) {
      if (!(number in live)) {
        show(row, number, row.state as 'running' | 'waiting');
      }
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
