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
 * Ticket passes, so the caller reports it in its own words.
 */
export function checkTicketWritable(db: DatabaseConnection, number: number) {
  const project = db
    .select({ name: projects.name, archived: projects.archived })
    .from(tickets)
    .innerJoin(projects, eq(projects.id, tickets.projectId))
    .where(eq(tickets.number, number))
    .get();
  if (project?.archived) {
    throw new NotAllowedError(
      `Ticket #${number} is in the archived Project "${project.name}". Restore the Project before changing its Tickets.`,
    );
  }
}
