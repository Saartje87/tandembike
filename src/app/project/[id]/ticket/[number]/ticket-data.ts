import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { appTickets } from '../../../../../tickets/app-tickets';
import { NotFoundError } from '../../../../../tickets/errors';

export type ProjectTicketPageProps = {
  params: Promise<{ id: string; number: string }>;
};

/** The Ticket and owning Project for a project-scoped ticket route. */
export async function loadProjectTicket(
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
  try {
    const ticket = tickets.getTicket(number);
    const project = tickets.getProject(projectId);
    if (ticket.projectId !== project.id) {
      notFound();
    }
    return { ticket, project, tickets };
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }
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
