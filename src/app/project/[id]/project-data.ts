import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { cockpitOf } from '../../../components/cockpit/cockpit-of';
import { appConversations } from '../../../conversations/app-conversations';
import { conversationActivity } from '../../../conversations/conversation-activity';
import { startRunLimit } from '../../../conversations/conversations';
import { appTickets } from '../../../tickets/app-tickets';
import { NotFoundError } from '../../../tickets/errors';
import { openTicketNumber } from '../../lib/paths';

/**
 * A Board's search parameters: `?ticket=` opens a Ticket (ADR 0013), and
 * `?q=` and `?label=` hold its Board filter.
 */
export type BoardSearchParams = Promise<{
  ticket?: string | string[];
  q?: string | string[];
  label?: string | string[];
}>;

export type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

/** A Project's Backlog tab, which can open a Ticket in a drawer. */
export type BacklogPageProps = ProjectPageProps & {
  searchParams: BoardSearchParams;
};

export type CyclePageProps = {
  params: Promise<{ id: string; cycleId: string }>;
  searchParams: BoardSearchParams;
};

/** `run()`, or the not-found page when it throws a `NotFoundError`. */
function orNotFound<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }
}

/**
 * The browser tab's title for a Board: `T12 Fix the header` while `?ticket=`
 * opens one of Project `projectId`'s Tickets, else `boardTitle`.
 */
export async function boardPageTitle(
  boardTitle: string,
  projectId: number,
  searchParams: BoardSearchParams,
): Promise<string> {
  const number = openTicketNumber((await searchParams).ticket);
  const ticket =
    number === undefined ? null : findBoardTicket(projectId, number);
  return ticket ? `T${ticket.number} ${ticket.title}` : boardTitle;
}

/**
 * Ticket `number`, if it exists and belongs to Project `projectId`, so its
 * Board can open it; `null` otherwise, and its drawer says it is not found.
 */
export function findBoardTicket(projectId: number, number: number) {
  try {
    const ticket = appTickets('user').getTicket(number);
    return ticket.projectId === projectId ? ticket : null;
  } catch (error) {
    if (error instanceof NotFoundError) {
      return null;
    }
    throw error;
  }
}

/** The Project for the `[id]` segment, or `null` when there is none. */
export async function findProject(params: ProjectPageProps['params']) {
  await connection();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id)) {
    return null;
  }
  try {
    return appTickets('user').getProject(id);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return null;
    }
    throw error;
  }
}

/** The Project for the `[id]` segment, or the not-found page. */
export async function loadProject(params: ProjectPageProps['params']) {
  return (await findProject(params)) ?? notFound();
}

/**
 * The Project and Cycle for the `[id]` and `[cycleId]` segments, or the
 * not-found page when either is missing or the Cycle is another Project's.
 */
export async function loadProjectCycle(params: CyclePageProps['params']) {
  const project = await loadProject(params);
  const cycleId = Number((await params).cycleId);
  if (!Number.isSafeInteger(cycleId)) {
    notFound();
  }
  const cycle = orNotFound(() => appTickets('user').getCycle(cycleId));
  if (cycle.projectId !== project.id) {
    notFound();
  }
  return { project, cycle };
}

/** The Project's Start runs working now, and how many it allows at once. */
export function runSlotsOf(projectId: number) {
  const used = appConversations()
    .list({ projectId })
    .filter(
      ({ intent, state }) =>
        intent === 'start' && (state === 'running' || state === 'waiting'),
    ).length;
  const cap = startRunLimit(
    appTickets('user').getProjectAgentSettings(projectId),
  );
  return { used, cap };
}

/**
 * Cycle `cycleId`'s Tickets, with the Project's Epics that are not planned
 * themselves, so an Epic shows while its children are on the Cycle.
 */
export function cycleTicketsWithEpics(projectId: number, cycleId: number) {
  const tickets = appTickets('user');
  const planned = tickets.listTickets({ projectId, cycleId });
  const plannedNumbers = new Set(planned.map(({ number }) => number));
  return [
    ...planned,
    ...tickets
      .listTickets({ projectId, type: 'Epic' })
      .filter(({ number }) => !plannedNumbers.has(number)),
  ];
}

/**
 * How many Tickets need the User on Project `projectId`'s Active Cycle's
 * Board, unfiltered; 0 without an Active Cycle.
 */
export function needsYouCountOf(projectId: number): number {
  const tickets = appTickets('user');
  const active = tickets
    .listCycles(projectId)
    .find(({ state }) => state === 'Active');
  if (!active) {
    return 0;
  }
  return cockpitOf(
    cycleTicketsWithEpics(projectId, active.id),
    conversationActivity(appConversations().activityRows()),
    tickets.listTickets({ projectId, cycleId: null }),
  ).needsYou.count;
}
