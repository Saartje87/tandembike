import { eq } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import { tickets } from '../db/schema';
import { NotAllowedError, NotFoundError } from './errors';
import type { TicketType } from './ticket-type';

/** A Ticket to attach to, or detach from, an Epic (ADR 0011). */
export type EpicChildInput = { epic: number; child: number };

/** The would-be child of an Epic: a new Ticket has no number yet. */
type ChildCandidate = {
  number?: number;
  type: TicketType;
  projectId: number;
  /** The Epic it is in already, if any. */
  epicNumber?: number | null;
};

/** `#42`, or `This Ticket` for one not created yet. */
function nameOf(number: number | undefined) {
  return number === undefined ? 'This Ticket' : `Ticket #${number}`;
}

/**
 * Throws unless `child` may join Epic `epicNumber`: one level only, within
 * one Project, at most one Epic per Ticket, and not into an archived Epic.
 * Run it in the transaction that makes the change.
 */
export function checkEpicChild(
  db: DatabaseConnection,
  epicNumber: number,
  child: ChildCandidate,
) {
  const epic = db
    .select({
      type: tickets.type,
      projectId: tickets.projectId,
      archived: tickets.archived,
    })
    .from(tickets)
    .where(eq(tickets.number, epicNumber))
    .get();
  if (!epic) {
    throw new NotFoundError(`There is no Ticket #${epicNumber}.`);
  }
  if (epic.type !== 'Epic') {
    throw new NotAllowedError(
      `Ticket #${epicNumber} is not an Epic. Only an Epic can have child Tickets.`,
    );
  }
  if (child.type === 'Epic') {
    throw new NotAllowedError(
      `${child.number === undefined ? 'An Epic' : `Ticket #${child.number} is an Epic, and an Epic`} cannot be a child of another Epic.`,
    );
  }
  if (child.epicNumber != null && child.epicNumber !== epicNumber) {
    throw new NotAllowedError(
      `${nameOf(child.number)} is already in Epic #${child.epicNumber}. Detach it from that Epic first.`,
    );
  }
  if (epic.projectId !== child.projectId) {
    throw new NotAllowedError(
      `Epic #${epicNumber} is in another Project. An Epic holds only its own Project's Tickets.`,
    );
  }
  if (epic.archived) {
    throw new NotAllowedError(
      `Epic #${epicNumber} is archived. Restore it before adding Tickets to it.`,
    );
  }
}

/**
 * Throws if Ticket `number` is grouped, a child or an Epic with children,
 * so it cannot move to another Project: an Epic holds only its own
 * Project's Tickets.
 */
export function checkUngrouped(
  db: DatabaseConnection,
  ticket: { number: number; epicNumber: number | null },
) {
  if (ticket.epicNumber !== null) {
    throw new NotAllowedError(
      `Ticket #${ticket.number} is in Epic #${ticket.epicNumber}. Detach it from its Epic before moving it to another Project.`,
    );
  }
  const child = db
    .select({ number: tickets.number })
    .from(tickets)
    .where(eq(tickets.epicNumber, ticket.number))
    .get();
  if (child) {
    throw new NotAllowedError(
      `Epic #${ticket.number} has child Tickets. Detach them before moving it to another Project.`,
    );
  }
}
