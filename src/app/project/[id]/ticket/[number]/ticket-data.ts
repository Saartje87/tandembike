import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { appTickets } from '../../../../../tickets/app-tickets';
import { NotFoundError } from '../../../../../tickets/errors';

export type ProjectTicketPageProps = {
  params: Promise<{ id: string; number: string }>;
};

/**
 * The Ticket and owning Project for a project-scoped ticket route, with the
 * Claim on its Epic, which covers it too. `null` when the Ticket does not
 * exist (any more); the not-found page for a bad URL or another Project.
 */
export async function findProjectTicket(
  params: ProjectTicketPageProps['params'],
) {
  await connection();
  const { id: rawProjectId, number: rawNumber } = await params;
  const projectId = Number(rawProjectId);
  const number = Number(rawNumber);
  if (!Number.isSafeInteger(projectId) || !Number.isSafeInteger(number)) {
    notFound();
  }

  const tickets = appTickets();
  const ticket = orNull(() => tickets.getTicket(number));
  if (ticket === null) {
    return null;
  }
  const project = orNull(() => tickets.getProject(projectId));
  if (project === null || ticket.projectId !== project.id) {
    notFound();
  }
  const epicClaim =
    ticket.epic === null ? null : tickets.getTicket(ticket.epic.number).claim;
  return { ticket, project, tickets, epicClaim };
}

/** What `find` returns, or `null` when it finds nothing. */
function orNull<T>(find: () => T): T | null {
  try {
    return find();
  } catch (error) {
    if (error instanceof NotFoundError) {
      return null;
    }
    throw error;
  }
}

/** Like `findProjectTicket`, but the not-found page for a missing Ticket. */
export async function loadProjectTicket(
  params: ProjectTicketPageProps['params'],
) {
  return (await findProjectTicket(params)) ?? notFound();
}

/** The Ticket for a number-only URL, or the not-found page. */
export async function loadTicketByNumber(rawNumber: string) {
  await connection();
  const number = Number(rawNumber);
  if (!Number.isSafeInteger(number)) {
    notFound();
  }
  try {
    return appTickets().getTicket(number);
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }
}
