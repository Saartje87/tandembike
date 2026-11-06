import type { ConversationState, TranscriptRole } from './conversation-state';

/**
 * What a Ticket's live Conversation is doing, for the Board's lanes. Later
 * fields (`line`, `since`, T1066) extend this object.
 * `running` and `waiting` are live; `interrupted` and `error` (an idle or
 * interrupted Conversation whose latest entry is an error) need the User.
 */
export type LiveConversation = {
  state: 'running' | 'waiting' | 'interrupted' | 'error';
};

export type ConversationActivity = {
  /** Per Ticket number, its newest live Conversation; none for idle/stopped. */
  live: Record<number, LiveConversation>;
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
  running: [],
  needsYou: [],
  needsYouCount: 0,
  needsYouByProject: {},
};

export type ActivityRow = {
  ticketNumber: number | null;
  projectId: number;
  state: ConversationState;
  /** Role of the Conversation's latest transcript entry, null if none. */
  latestRole: TranscriptRole | null;
};

const liveStateOf = (row: ActivityRow): LiveConversation['state'] | null => {
  if (row.state === 'running' || row.state === 'waiting') {
    return row.state;
  }
  if (row.state === 'idle' || row.state === 'interrupted') {
    if (row.latestRole === 'error') {
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
      live[row.ticketNumber] = { state };
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
    running: ticketsOf(
      conversations.filter(({ state }) => state === 'running'),
    ),
    needsYou: ticketsOf(waiting),
    needsYouCount: waiting.length,
    needsYouByProject: countBy(waiting.map(({ projectId }) => projectId)),
  };
}
