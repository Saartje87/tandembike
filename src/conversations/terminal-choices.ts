import { type LiveMap, placementOf } from '../tickets/ticket-lanes';
import type { FindTicketsInput, Ticket, Tickets } from '../tickets/tickets';
import { isTriageStateLabel, readyForAgent } from '../tickets/triage-labels';

const needsTriage = 'needs-triage';

import { isTerminal } from './conversation-state';
import type { Conversation } from './conversations';

/**
 * What the `tandembike` wizard lists for each action (T1357, ADR 0052): the
 * Tickets, or the Conversations, that the action accepts in one Project, in
 * the order the wizard shows them.
 */

/** A Ticket the wizard offers. */
export type TicketChoice = { number: number; title: string };

/** A Conversation the wizard offers to resume. */
export type ConversationChoice = {
  conversationId: number;
  /** Its Ticket; null for a Conversation about its Project. */
  ticketNumber: number | null;
  /** Its Ticket's title, else its intent. */
  title: string;
};

export type ChoiceIntent = 'start' | 'triage' | 'spec' | 'resume';

export const choiceIntents: readonly ChoiceIntent[] = [
  'start',
  'triage',
  'spec',
  'resume',
];

export const isChoiceIntent = (value: unknown): value is ChoiceIntent =>
  typeof value === 'string' &&
  (choiceIntents as readonly string[]).includes(value);

const byOwnState: LiveMap = {};

type Deps = {
  tickets: Tickets;
  /** The Project's Conversations, newest first. */
  conversationsOf: (projectId: number) => Conversation[];
};

/** Every Ticket of the Project matching `extra`, in Board order. */
function listAll(
  tickets: Tickets,
  projectId: number,
  extra: Partial<FindTicketsInput>,
): Ticket[] {
  const found: Ticket[] = [];
  let cursor: number | undefined;
  do {
    const page = tickets.findTickets({
      projectId,
      sort: 'position',
      detail: 'full',
      limit: 200,
      cursor,
      ...extra,
    });
    found.push(...(page.tickets as Ticket[]));
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return found;
}

const choiceOf = ({ number, title }: Ticket): TicketChoice => ({
  number,
  title,
});

/**
 * Implement: the Active Cycle's ready items, unblocked and unclaimed, not an
 * Epic's child, an Epic only with a child, and with no Start Conversation
 * working on it, in Board order; `next_work`'s pick first.
 */
function startChoices(
  { tickets, conversationsOf }: Deps,
  projectId: number,
): TicketChoice[] {
  const active = tickets.activeCycle(projectId);
  if (!active) return [];
  const working = new Set(
    conversationsOf(projectId)
      .filter(
        (c) =>
          c.intent === 'start' &&
          !c.hidden &&
          (c.state === 'running' || c.state === 'waiting'),
      )
      .map((c) => c.ticketNumber),
  );
  const open = listAll(tickets, projectId, {
    cycleId: active.id,
    status: 'Todo',
    labels: [readyForAgent],
  }).filter(
    (ticket) =>
      ticket.epic === null &&
      (ticket.type === 'Ticket' ||
        ticket.children.some((child) => !child.archived)) &&
      !ticket.blocked &&
      ticket.claim === null &&
      !working.has(ticket.number),
  );
  const pick = tickets.nextWork({ projectId }).ticket;
  if (pick === null || working.has(pick.number)) return open.map(choiceOf);
  return [
    choiceOf(pick),
    ...open.filter(({ number }) => number !== pick.number).map(choiceOf),
  ];
}

/**
 * Triage: the untriaged Todo Tickets, labelled `needs-triage` or with no
 * triage state label, in Board order.
 */
function triageChoices({ tickets }: Deps, projectId: number): TicketChoice[] {
  return listAll(tickets, projectId, { status: 'Todo' })
    .filter(
      ({ labels }) =>
        labels.includes(needsTriage) || !labels.some(isTriageStateLabel),
    )
    .map(choiceOf);
}

/** Spec: the ideas in Intake and the Epics without children, in Board order. */
function specChoices({ tickets }: Deps, projectId: number): TicketChoice[] {
  return listAll(tickets, projectId, { status: 'Todo' })
    .filter((ticket) => placementOf(ticket, byOwnState).offers.spec)
    .map(choiceOf);
}

/**
 * Resume: the Conversations Continue in terminal would accept, newest first:
 * open, not in a terminal, Claude Code, with an SDK session and a worktree
 * that was not removed.
 */
function resumeChoices(
  { tickets, conversationsOf }: Deps,
  projectId: number,
): ConversationChoice[] {
  return conversationsOf(projectId)
    .filter(
      (c) =>
        !isTerminal(c) &&
        !c.hidden &&
        c.agentKind === 'claude-code' &&
        c.sdkSessionId !== null &&
        !c.worktreeRemoved,
    )
    .map((c) => ({
      conversationId: c.id,
      ticketNumber: c.ticketNumber,
      title:
        c.ticketNumber === null
          ? c.intent
          : tickets.getTicket(c.ticketNumber).title,
    }));
}

/** What the wizard lists for an intent: Conversations to resume, else Tickets. */
export type ChoicesOf<I extends ChoiceIntent> = I extends 'resume'
  ? ConversationChoice[]
  : TicketChoice[];

/** The choices the wizard lists for `intent` in Project `projectId`. */
export function terminalChoicesOf<I extends ChoiceIntent>(
  deps: Deps,
  intent: I,
  projectId: number,
): ChoicesOf<I> {
  const lists: Record<
    ChoiceIntent,
    () => TicketChoice[] | ConversationChoice[]
  > = {
    start: () => startChoices(deps, projectId),
    triage: () => triageChoices(deps, projectId),
    spec: () => specChoices(deps, projectId),
    resume: () => resumeChoices(deps, projectId),
  };
  return lists[intent]() as ChoicesOf<I>;
}
