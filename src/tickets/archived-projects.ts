import { eq } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import { projects, tickets } from '../db/schema';
import { NotAllowedError, NotFoundError } from './errors';

/**
 * Throws unless Project `id` exists and may change: an archived Project and
 * its Tickets and Cycles are read-only until it is restored.
 */
export function checkProjectWritable(db: DatabaseConnection, id: number) {
  const project = db
    .select({ name: projects.name, archived: projects.archived })
    .from(projects)
    .where(eq(projects.id, id))
    .get();
  if (!project) {
    throw new NotFoundError(`There is no Project with id ${id}.`);
  }
  if (project.archived) {
    throw new NotAllowedError(
      `The Project "${project.name}" is archived. Restore it before changing it or its Tickets.`,
    );
  }
}

/**
 * Throws when Ticket `number` belongs to an archived Project. A missing
 * Ticket passes, so the caller reports it in its own words. Only the writes
 * an archived Ticket still allows use this alone: restoring or archiving it,
 * its comments and Attachments, releasing or clearing its Claim (T1312), and
 * deleting it. Every other write uses `checkTicketWritable`.
 */
export function checkTicketProjectWritable(
  db: DatabaseConnection,
  number: number,
) {
  const ticket = db
    .select({
      archived: tickets.archived,
      projectName: projects.name,
      projectArchived: projects.archived,
    })
    .from(tickets)
    .innerJoin(projects, eq(projects.id, tickets.projectId))
    .where(eq(tickets.number, number))
    .get();
  if (ticket?.projectArchived) {
    throw new NotAllowedError(
      `Ticket T${number} is in the archived Project "${ticket.projectName}". Restore the Project before changing its Tickets.`,
    );
  }
  return ticket;
}

/**
 * Throws unless Ticket `number` may change: an archived Ticket, and every
 * Ticket of an archived Project, is read-only until it is restored. A
 * missing Ticket passes, so the caller reports it in its own words. For the
 * few writes an archived Ticket allows, see `checkTicketProjectWritable`.
 */
export function checkTicketWritable(db: DatabaseConnection, number: number) {
  if (checkTicketProjectWritable(db, number)?.archived) {
    throw new NotAllowedError(
      `Ticket T${number} is archived. Restore it before changing it.`,
    );
  }
}
