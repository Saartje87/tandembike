import type { ConversationState } from './conversation-state';

export type ConversationActivity = {
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
  running: [],
  needsYou: [],
  needsYouCount: 0,
  needsYouByProject: {},
};

type ActivityRow = {
  ticketNumber: number | null;
  projectId: number;
  state: ConversationState;
};

/** Whether a Conversation in this state waits for the User (T593). */
const needsYou = (state: ConversationState) =>
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
    running: ticketsOf(
      conversations.filter(({ state }) => state === 'running'),
    ),
    needsYou: ticketsOf(waiting),
    needsYouCount: waiting.length,
    needsYouByProject: countBy(waiting.map(({ projectId }) => projectId)),
  };
}
