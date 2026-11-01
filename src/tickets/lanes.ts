import { and, asc, eq } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import { cycles, tickets } from '../db/schema';
import type { ChangeChannel } from './changes';
import { cycleMembers, outOfBacklog } from './cycles';
import { NotAllowedError, NotFoundError, ValidationError } from './errors';
import type { Status } from './status';

/** Which part of a Project's Status lane a reorder or sort works on. */
export type LaneScope = {
  projectId: number;
  status: Status;
  /**
   * Only the part a Cycle's Board shows, or with `null`, the part the
   * Backlog shows; see `ListTicketsFilter.cycleId`. Defaults to the whole
   * Project's lane.
   */
  cycleId?: number | null;
};

type LaneTicket = { number: number; archived: boolean };

/** A Status lane as `laneOf` reads it. */
export type Lane = {
  /** The whole lane in Board order, archived Tickets included. */
  tickets: LaneTicket[];
  /** The numbers of the Tickets in scope, in Board order. */
  scopeOrder: number[];
  /** Whether a Ticket of the lane is in scope; only these move. */
  inScope: (ticket: LaneTicket) => boolean;
};

/**
 * A Project's Status lane in Board order, archived Tickets included, and
 * the numbers of the Tickets in `scope` in that order: the active ones on
 * the Board the scope names. Only these move; the others keep their slots.
 */
export function laneOf(db: DatabaseConnection, scope: LaneScope): Lane {
  const { projectId, status, cycleId } = scope;
  const lane: LaneTicket[] = db
    .select({ number: tickets.number, archived: tickets.archived })
    .from(tickets)
    .where(and(eq(tickets.projectId, projectId), eq(tickets.status, status)))
    .orderBy(asc(tickets.position), asc(tickets.createdAt), asc(tickets.number))
    .all();
  const members =
    cycleId === undefined
      ? undefined
      : new Set(
          (cycleId === null ? outOfBacklog(db) : cycleMembers(db, cycleId))
            .all()
            .map(({ number }) => number),
        );
  const inScope = ({ number, archived }: LaneTicket) =>
    !archived &&
    (members === undefined || members.has(number) === (cycleId !== null));
  return {
    tickets: lane,
    scopeOrder: lane.filter(inScope).map(({ number }) => number),
    inScope,
  };
}

/**
 * Gives the Tickets in scope the slots they hold in `lane`, in the order of
 * `ordered`, and announces each change. The others keep their slots.
 * Returns the scope's resulting order.
 */
export function writeLaneOrder(
  db: DatabaseConnection,
  changes: ChangeChannel,
  { tickets: lane, inScope }: Lane,
  ordered: readonly number[],
): number[] {
  let index = 0;
  const orderedLane = lane.map((ticket) =>
    inScope(ticket) ? ordered[index++] : ticket.number,
  );
  if (orderedLane.every((number, slot) => number === lane[slot].number)) {
    return [...ordered];
  }
  db.transaction((transaction) => {
    orderedLane.forEach((number, position) => {
      transaction
        .update(tickets)
        .set({ position })
        .where(eq(tickets.number, number))
        .run();
    });
  });
  for (const number of orderedLane) {
    changes.publish({ type: 'ticket', number });
  }
  return [...ordered];
}

/** Throws unless Cycle `cycleId` exists and is Project `projectId`'s. */
export function checkLaneCycle(
  db: DatabaseConnection,
  projectId: number,
  cycleId: number,
) {
  const cycle = db
    .select({ projectId: cycles.projectId, title: cycles.title })
    .from(cycles)
    .where(eq(cycles.id, cycleId))
    .get();
  if (!cycle) {
    throw new NotFoundError(`There is no Cycle with id ${cycleId}.`);
  }
  if (cycle.projectId !== projectId) {
    throw new NotAllowedError(
      `The Cycle "${cycle.title}" is in another Project. Sort a lane of its own Project.`,
    );
  }
  return cycle;
}

/**
 * Throws, naming Ticket `number`, why it is not in `scope`, given that it is
 * not among the scope's Tickets.
 */
export function throwOutOfScope(
  db: DatabaseConnection,
  scope: LaneScope,
  number: number,
  cycleTitle: string | undefined,
): never {
  const ticket = db
    .select({
      projectId: tickets.projectId,
      status: tickets.status,
      archived: tickets.archived,
    })
    .from(tickets)
    .where(eq(tickets.number, number))
    .get();
  if (!ticket) {
    throw new NotFoundError(`There is no Ticket T${number}.`);
  }
  const reason =
    ticket.projectId !== scope.projectId
      ? `Ticket T${number} is not in this Project.`
      : ticket.archived
        ? `Ticket T${number} is archived. Restore it before sorting it.`
        : ticket.status !== scope.status
          ? `Ticket T${number} is ${ticket.status}, not ${scope.status}. Sorting a lane never changes a Status.`
          : scope.cycleId === null
            ? `Ticket T${number} is in a Cycle, not the Backlog.`
            : `Ticket T${number} is not in the Cycle "${cycleTitle}".`;
  throw new ValidationError({ ticketNumbers: reason });
}
