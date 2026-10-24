import { and, eq, max, ne } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import { tickets } from '../db/schema';
import type { Status } from './status';

/**
 * The position after the last Ticket in a Project's Status lane, leaving
 * out Ticket `exceptNumber`, which is the one moving there.
 */
export function nextPosition(
  db: DatabaseConnection,
  projectId: number,
  status: Status,
  exceptNumber?: number,
): number {
  const result = db
    .select({ position: max(tickets.position) })
    .from(tickets)
    .where(
      and(
        eq(tickets.projectId, projectId),
        eq(tickets.status, status),
        exceptNumber === undefined
          ? undefined
          : ne(tickets.number, exceptNumber),
      ),
    )
    .get();
  return (result?.position ?? -1) + 1;
}
