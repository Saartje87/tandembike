import { and, asc, eq, inArray, ne } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import { cycles, cycleTickets, projects, tickets } from '../db/schema';
import type { ChangeChannel } from './changes';
import type { CycleState } from './cycle-state';
import { NotAllowedError, NotFoundError } from './errors';
import { checkTitle, throwFieldErrors } from './rules';

/** A goal-led plan within one Project (ADR 0010). */
export type Cycle = {
  id: number;
  projectId: number;
  /** One line, trimmed: the goal it works towards. */
  title: string;
  state: CycleState;
  /**
   * The numbers of the Tickets planned into it, sorted. An Archived Cycle's
   * are its final membership.
   */
  ticketNumbers: number[];
  createdAt: Date;
  /** When it was archived, or `null` while it is not. */
  archivedAt: Date | null;
};

export type CreateCycleInput = { projectId: number; title: string };

export type RenameCycleInput = { title: string };

export type StartCycleInput = {
  /**
   * Confirms archiving the Project's Active Cycle, if it has one, and
   * rolling its open, non-archived Tickets into the started Cycle.
   * Defaults to false, which refuses to start while another is Active.
   */
  archiveActive?: boolean;
  /**
   * The Active Cycle the confirmation was given for. When another Cycle is
   * Active by now, the start is refused rather than archive that one.
   */
  activeCycleId?: number;
};

/** A Ticket to plan into, or out of, a Cycle. */
export type CycleTicketInput = { cycleId: number; number: number };

const cycleColumns = {
  id: cycles.id,
  projectId: cycles.projectId,
  title: cycles.title,
  state: cycles.state,
  createdAt: cycles.createdAt,
  archivedAt: cycles.archivedAt,
};

type CycleRow = Omit<Cycle, 'ticketNumbers'>;

/** Throws unless `cycle` may change: an Archived Cycle is read-only. */
function checkChangeable(cycle: Pick<CycleRow, 'title' | 'state'>) {
  if (cycle.state === 'Archived') {
    throw new NotAllowedError(
      `The Cycle "${cycle.title}" is Archived and cannot change.`,
    );
  }
}

/** A trimmed Cycle title, or a `ValidationError` when it breaks the rules. */
function checkedCycleTitle(rawTitle: string): string {
  const title = rawTitle.trim();
  throwFieldErrors({ title: checkTitle(title) });
  return title;
}

/** Throws a `NotFoundError` unless Project `id` exists. */
function checkProjectExists(db: DatabaseConnection, id: number) {
  const project = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, id))
    .get();
  if (!project) {
    throw new NotFoundError(`There is no Project with id ${id}.`);
  }
}

/** `rows` with each Cycle's sorted Ticket numbers, in one query. */
function withTicketNumbers(db: DatabaseConnection, rows: CycleRow[]): Cycle[] {
  const numbersById = new Map<number, number[]>(
    rows.map((row) => [row.id, []]),
  );
  if (rows.length > 0) {
    const memberRows = db
      .select({
        cycleId: cycleTickets.cycleId,
        number: cycleTickets.ticketNumber,
      })
      .from(cycleTickets)
      .where(inArray(cycleTickets.cycleId, [...numbersById.keys()]))
      .orderBy(asc(cycleTickets.ticketNumber))
      .all();
    for (const { cycleId, number } of memberRows) {
      numbersById.get(cycleId)?.push(number);
    }
  }
  return rows.map((row) => ({
    ...row,
    ticketNumbers: numbersById.get(row.id) ?? [],
  }));
}

/**
 * A subquery of the Ticket numbers in Cycle `cycleId`, or with `null`, in
 * any Cycle that is not Archived: what `listTickets` filters by.
 */
export function cycleMembers(db: DatabaseConnection, cycleId: number | null) {
  return db
    .select({ number: cycleTickets.ticketNumber })
    .from(cycleTickets)
    .innerJoin(cycles, eq(cycles.id, cycleTickets.cycleId))
    .where(
      cycleId === null
        ? ne(cycles.state, 'Archived')
        : eq(cycleTickets.cycleId, cycleId),
    );
}

/**
 * Plans just-created Ticket `number` of Project `projectId` into Cycle
 * `cycleId`, which must be that Project's. Run it in the creating
 * transaction, so a refusal creates nothing.
 */
export function planNewTicket(
  db: DatabaseConnection,
  { cycleId, number }: CycleTicketInput,
  projectId: number,
) {
  const cycle = db
    .select({
      projectId: cycles.projectId,
      title: cycles.title,
      state: cycles.state,
    })
    .from(cycles)
    .where(eq(cycles.id, cycleId))
    .get();
  if (!cycle) {
    throw new NotFoundError(`There is no Cycle with id ${cycleId}.`);
  }
  checkChangeable(cycle);
  if (cycle.projectId !== projectId) {
    throw new NotAllowedError(
      `The Cycle "${cycle.title}" is in another Project. A Cycle holds only its own Project's Tickets.`,
    );
  }
  db.insert(cycleTickets).values({ cycleId, ticketNumber: number }).run();
}

/**
 * Takes Ticket `number` out of every Cycle that is not Archived, as when it
 * moves to another Project: a plan holds only its own Project's Tickets.
 * Returns the ids of the Cycles it left.
 */
export function leaveOpenCycles(
  db: DatabaseConnection,
  number: number,
): number[] {
  const left = db
    .select({ id: cycleTickets.cycleId })
    .from(cycleTickets)
    .innerJoin(cycles, eq(cycles.id, cycleTickets.cycleId))
    .where(
      and(eq(cycleTickets.ticketNumber, number), ne(cycles.state, 'Archived')),
    )
    .all()
    .map(({ id }) => id);
  if (left.length > 0) {
    db.delete(cycleTickets)
      .where(
        and(
          eq(cycleTickets.ticketNumber, number),
          inArray(cycleTickets.cycleId, left),
        ),
      )
      .run();
  }
  return left;
}

/**
 * The Tickets module's Cycle functions, spread into `createTickets`: they
 * share its database and change channel.
 */
export function createCycles(db: DatabaseConnection, changes: ChangeChannel) {
  function cycleRow(id: number): CycleRow {
    const cycle = db
      .select(cycleColumns)
      .from(cycles)
      .where(eq(cycles.id, id))
      .get();
    if (!cycle) {
      throw new NotFoundError(`There is no Cycle with id ${id}.`);
    }
    return cycle;
  }

  function getCycle(id: number): Cycle {
    return withTicketNumbers(db, [cycleRow(id)])[0];
  }

  return {
    getCycle,

    /** Every Cycle of Project `projectId`, oldest first. */
    listCycles(projectId: number): Cycle[] {
      checkProjectExists(db, projectId);
      const rows = db
        .select(cycleColumns)
        .from(cycles)
        .where(eq(cycles.projectId, projectId))
        .orderBy(asc(cycles.id))
        .all();
      return withTicketNumbers(db, rows);
    },

    /** Creates an empty, Prepared Cycle in a Project. */
    createCycle(input: CreateCycleInput): Cycle {
      const title = checkedCycleTitle(input.title);
      checkProjectExists(db, input.projectId);
      const { id } = db
        .insert(cycles)
        .values({
          projectId: input.projectId,
          title,
          state: 'Prepared',
          createdAt: new Date(),
        })
        .returning({ id: cycles.id })
        .get();
      changes.publish({ type: 'cycle', id });
      return getCycle(id);
    },

    /** Renames Cycle `id` by the rules for creating one. */
    renameCycle(id: number, input: RenameCycleInput): Cycle {
      const title = checkedCycleTitle(input.title);
      checkChangeable(cycleRow(id));
      db.update(cycles).set({ title }).where(eq(cycles.id, id)).run();
      changes.publish({ type: 'cycle', id });
      return getCycle(id);
    },

    /**
     * Deletes Prepared Cycle `id`, a plan the User no longer wants; its
     * Tickets go back to the Backlog.
     */
    discardCycle(id: number): void {
      const cycle = cycleRow(id);
      if (cycle.state !== 'Prepared') {
        throw new NotAllowedError(
          `The Cycle "${cycle.title}" is ${cycle.state}. Only a Prepared Cycle can be discarded.`,
        );
      }
      db.transaction(() => {
        db.delete(cycleTickets).where(eq(cycleTickets.cycleId, id)).run();
        db.delete(cycles).where(eq(cycles.id, id)).run();
      });
      changes.publish({ type: 'cycle', id });
    },

    /**
     * Makes Prepared Cycle `id` its Project's Active Cycle, whatever its
     * Tickets' Statuses. While another Cycle is Active it is refused, unless
     * `archiveActive` confirms the rollover (ADR 0010): that Cycle is
     * archived and its open, non-archived Tickets join this one, all in one
     * transaction.
     */
    startCycle(
      id: number,
      { archiveActive = false, activeCycleId }: StartCycleInput = {},
    ): Cycle {
      const archivedId = db.transaction(() => {
        const cycle = cycleRow(id);
        if (cycle.state === 'Active') {
          throw new NotAllowedError(
            `The Cycle "${cycle.title}" is Active already.`,
          );
        }
        if (cycle.state === 'Archived') {
          throw new NotAllowedError(
            `The Cycle "${cycle.title}" is Archived. Only a Prepared Cycle can be started.`,
          );
        }
        const active = db
          .select({ id: cycles.id, title: cycles.title })
          .from(cycles)
          .where(
            and(
              eq(cycles.projectId, cycle.projectId),
              eq(cycles.state, 'Active'),
            ),
          )
          .get();
        if (active && !archiveActive) {
          throw new NotAllowedError(
            `The Cycle "${active.title}" is Active. Starting another archives it, so confirm that first.`,
          );
        }
        if (
          active &&
          activeCycleId !== undefined &&
          active.id !== activeCycleId
        ) {
          throw new NotAllowedError(
            `The Active Cycle is now "${active.title}", not the one you confirmed archiving. Check it and try again.`,
          );
        }
        if (active) {
          const rolledOver = db
            .select({ number: cycleTickets.ticketNumber })
            .from(cycleTickets)
            .innerJoin(tickets, eq(tickets.number, cycleTickets.ticketNumber))
            .where(
              and(
                eq(cycleTickets.cycleId, active.id),
                ne(tickets.status, 'Done'),
                eq(tickets.archived, false),
              ),
            )
            .all();
          db.update(cycles)
            .set({ state: 'Archived', archivedAt: new Date() })
            .where(eq(cycles.id, active.id))
            .run();
          if (rolledOver.length > 0) {
            db.insert(cycleTickets)
              .values(
                rolledOver.map(({ number }) => ({
                  cycleId: id,
                  ticketNumber: number,
                })),
              )
              .run();
          }
        }
        db.update(cycles)
          .set({ state: 'Active' })
          .where(eq(cycles.id, id))
          .run();
        return active?.id;
      });
      if (archivedId !== undefined) {
        changes.publish({ type: 'cycle', id: archivedId });
      }
      changes.publish({ type: 'cycle', id });
      return getCycle(id);
    },

    /**
     * Archives Active Cycle `id`, finished or not. Only the Cycle changes:
     * its Tickets keep their Status and archived flag, and its membership
     * stays as history while unfinished Tickets return to the Backlog.
     */
    archiveCycle(id: number): Cycle {
      const cycle = cycleRow(id);
      if (cycle.state === 'Archived') {
        throw new NotAllowedError(
          `The Cycle "${cycle.title}" is Archived already.`,
        );
      }
      if (cycle.state === 'Prepared') {
        throw new NotAllowedError(
          `The Cycle "${cycle.title}" is Prepared. Only an Active Cycle can be archived; discard a Prepared one instead.`,
        );
      }
      db.update(cycles)
        .set({ state: 'Archived', archivedAt: new Date() })
        .where(eq(cycles.id, id))
        .run();
      changes.publish({ type: 'cycle', id });
      return getCycle(id);
    },

    /**
     * Plans Ticket `number` into Cycle `cycleId`; planning a member again
     * changes nothing. Only an open, non-archived Ticket of the Cycle's
     * Project can be planned, and only while it is in no other Cycle that is
     * not Archived.
     */
    planTicket({ cycleId, number }: CycleTicketInput): Cycle {
      db.transaction(() => {
        const cycle = cycleRow(cycleId);
        checkChangeable(cycle);
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
          throw new NotFoundError(`There is no Ticket #${number}.`);
        }
        const current = db
          .select({ id: cycles.id, title: cycles.title })
          .from(cycleTickets)
          .innerJoin(cycles, eq(cycles.id, cycleTickets.cycleId))
          .where(
            and(
              eq(cycleTickets.ticketNumber, number),
              ne(cycles.state, 'Archived'),
            ),
          )
          .get();
        if (current?.id === cycleId) {
          return;
        }
        if (ticket.projectId !== cycle.projectId) {
          throw new NotAllowedError(
            `Ticket #${number} is in another Project. A Cycle holds only its own Project's Tickets.`,
          );
        }
        if (ticket.archived) {
          throw new NotAllowedError(
            `Ticket #${number} is archived. Restore it before planning it into a Cycle.`,
          );
        }
        if (ticket.status === 'Done') {
          throw new NotAllowedError(
            `Ticket #${number} is Done. Only open Tickets can be planned into a Cycle.`,
          );
        }
        if (current) {
          throw new NotAllowedError(
            `Ticket #${number} is already planned into the Cycle "${current.title}". Remove it from that Cycle first.`,
          );
        }
        db.insert(cycleTickets).values({ cycleId, ticketNumber: number }).run();
      });
      changes.publish({ type: 'cycle', id: cycleId });
      return getCycle(cycleId);
    },

    /** Takes Ticket `number` out of Cycle `cycleId`, back to the Backlog. */
    unplanTicket({ cycleId, number }: CycleTicketInput): Cycle {
      const cycle = cycleRow(cycleId);
      checkChangeable(cycle);
      const removed = db
        .delete(cycleTickets)
        .where(
          and(
            eq(cycleTickets.cycleId, cycleId),
            eq(cycleTickets.ticketNumber, number),
          ),
        )
        .returning({ number: cycleTickets.ticketNumber })
        .get();
      if (!removed) {
        const ticket = db
          .select({ number: tickets.number })
          .from(tickets)
          .where(eq(tickets.number, number))
          .get();
        throw ticket
          ? new NotAllowedError(
              `Ticket #${number} is not planned into the Cycle "${cycle.title}".`,
            )
          : new NotFoundError(`There is no Ticket #${number}.`);
      }
      changes.publish({ type: 'cycle', id: cycleId });
      return getCycle(cycleId);
    },
  };
}
