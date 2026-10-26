import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { appTickets } from '../../../tickets/app-tickets';
import { NotFoundError } from '../../../tickets/errors';
import { openTicketNumber } from '../../lib/paths';

/** A Board's search parameters: `?ticket=` opens a Ticket (ADR 0013). */
export type BoardSearchParams = Promise<{ ticket?: string | string[] }>;

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
 * Board can open it; `null` otherwise, and the Board shows on its own.
 */
export function findBoardTicket(projectId: number, number: number) {
  try {
    const ticket = appTickets().getTicket(number);
    return ticket.projectId === projectId ? ticket : null;
  } catch (error) {
    if (error instanceof NotFoundError) {
      return null;
    }
    throw error;
  }
}

/** The Project for the `[id]` segment, or the not-found page. */
export async function loadProject(params: ProjectPageProps['params']) {
  await connection();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id)) {
    notFound();
  }
  return orNotFound(() => appTickets().getProject(id));
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
  const cycle = orNotFound(() => appTickets().getCycle(cycleId));
  if (cycle.projectId !== project.id) {
    notFound();
  }
  return { project, cycle };
}
