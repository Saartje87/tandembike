import { and, asc, eq } from 'drizzle-orm';

import { tickets } from '../db/schema';
import { epicStatusRule } from './epics';
import { NotAllowedError, NotFoundError, ValidationError } from './errors';
import {
  checkLaneCycle,
  laneOf,
  throwOutOfScope,
  writeLaneOrder,
} from './lanes';
import { checkBatchNumbers, throwFieldErrors } from './rules';
import { isStatus, statusRule } from './status';
import { claimChanges, type TicketRowContext } from './ticket-row-context';
import type {
  MoveTicketsInput,
  ReorderAnchor,
  ReorderTicketsInput,
  SortLaneInput,
} from './tickets';

/**
 * The order area of the Tickets module: the order of a Status lane on the
 * Board, set whole, by one move, by sorting, or by moving Tickets into it.
 */
export function createTicketOrder(ctx: TicketRowContext) {
  const {
    db,
    changes,
    recordActivity,
    syncEpicStatus,
    checkTicketWritable,
    checkProjectWritable,
  } = ctx;
  return {
    /**
     * Sets the order of the active Tickets in a Project's Status lane, or in
     * the part of it a Cycle or the Backlog shows. Archived Tickets, and
     * Tickets outside that part, keep their slots. The complete lane must be
     * supplied so stale Board data cannot silently lose a Ticket.
     */
    reorderTickets(input: ReorderTicketsInput): void {
      const { projectId, status, ticketNumbers } = input;
      if (!isStatus(status)) {
        throw new ValidationError({ status: statusRule });
      }
      if (
        ticketNumbers.some(
          (number) => !Number.isSafeInteger(number) || number < 1,
        ) ||
        new Set(ticketNumbers).size !== ticketNumbers.length
      ) {
        throw new ValidationError({
          ticketNumbers: 'Choose each Ticket in the lane exactly once.',
        });
      }

      checkProjectWritable(projectId);

      const lane = laneOf(db, input);
      if (
        lane.scopeOrder.length !== ticketNumbers.length ||
        lane.scopeOrder.some((number) => !ticketNumbers.includes(number))
      ) {
        throw new ValidationError({
          ticketNumbers: 'Refresh the Board and try reordering again.',
        });
      }
      writeLaneOrder(db, changes, lane, ticketNumbers);
    },

    /**
     * Moves active Ticket `number` directly before or after another active
     * Ticket of its Project and Status lane, by the same rule as a drag on
     * the Board: the other Tickets keep their order, archived ones their
     * slots. Records the move in Activity and announces it; a Ticket already
     * there changes nothing. Refused when the anchor is the Ticket itself,
     * missing, archived, or in another Project or Status.
     */
    reorderTicket(number: number, anchor: ReorderAnchor): void {
      const [field, other] =
        'before' in anchor
          ? (['before', anchor.before] as const)
          : (['after', anchor.after] as const);
      if (other === number) {
        throw new ValidationError({
          [field]: `Choose another Ticket than T${number} to move it next to.`,
        });
      }
      const laneTicket = (of: number) => {
        const row = db
          .select({
            projectId: tickets.projectId,
            status: tickets.status,
            archived: tickets.archived,
          })
          .from(tickets)
          .where(eq(tickets.number, of))
          .get();
        if (!row) {
          throw new NotFoundError(`There is no Ticket T${of}.`);
        }
        return row;
      };
      db.transaction(() => {
        const ticket = laneTicket(number);
        checkTicketWritable(number);
        const target = laneTicket(other);
        if (target.projectId !== ticket.projectId) {
          throw new NotAllowedError(
            `T${other} is in another Project. A Ticket moves only among the Tickets of its own Project.`,
          );
        }
        if (target.archived) {
          throw new NotAllowedError(
            `T${other} is archived and not on the Board. Move T${number} next to a Ticket on the Board.`,
          );
        }
        if (target.status !== ticket.status) {
          throw new NotAllowedError(
            `T${other} is ${target.status}, not ${ticket.status} like T${number}. A Ticket moves only within its own Status; change its Status with update_ticket status.`,
          );
        }
        const lane = laneOf(db, {
          projectId: ticket.projectId,
          status: ticket.status,
        });
        const order = lane.scopeOrder.filter((each) => each !== number);
        const slot = order.indexOf(other) + (field === 'after' ? 1 : 0);
        order.splice(slot, 0, number);
        if (order.every((each, index) => each === lane.scopeOrder[index])) {
          return;
        }
        writeLaneOrder(db, changes, lane, order);
        recordActivity(number, [
          field === 'before'
            ? { type: 'reordered', before: other }
            : { type: 'reordered', after: other },
        ]);
      });
    },

    /**
     * Sorts the active Tickets in a Project's Status lane, or in the part of
     * it a Cycle or the Backlog shows: the listed Tickets take the top slots
     * in the order given, and the others keep their order below them.
     * Archived Tickets, and Tickets outside that part, keep their slots. All
     * or nothing: a listed Ticket outside the part refuses the whole call.
     * Returns the part's resulting order.
     */
    sortLane(input: SortLaneInput): number[] {
      const { projectId, status, ticketNumbers, cycleId } = input;
      throwFieldErrors({
        ticketNumbers: checkBatchNumbers(ticketNumbers),
        status: isStatus(status) ? undefined : statusRule,
      });

      checkProjectWritable(projectId);
      const cycle =
        cycleId === undefined || cycleId === null
          ? undefined
          : checkLaneCycle(db, projectId, cycleId);

      const lane = laneOf(db, input);
      for (const number of ticketNumbers) {
        if (!lane.scopeOrder.includes(number)) {
          throwOutOfScope(db, input, number, cycle?.title);
        }
      }
      return writeLaneOrder(db, changes, lane, [
        ...ticketNumbers,
        ...lane.scopeOrder.filter((number) => !ticketNumbers.includes(number)),
      ]);
    },

    /**
     * Moves active normal Tickets of Project `projectId` into its `status`
     * lane, next to each other in the order given, just before Ticket
     * `before` or at the end of the lane. The other Tickets in the lane keep
     * their order. All or nothing: if any Ticket cannot move, none does.
     * Moving to Done releases a Claim, and a child's move updates its Epic's
     * Status, as `updateTicket` does. The change is announced once.
     */
    moveTickets(input: MoveTicketsInput): void {
      const { projectId, ticketNumbers, status, before } = input;
      throwFieldErrors({
        ticketNumbers: checkBatchNumbers(ticketNumbers),
        status: isStatus(status) ? undefined : statusRule,
      });

      const changedEpics = new Set<number>();
      db.transaction(() => {
        checkProjectWritable(projectId);
        const moving = ticketNumbers.map((number) => {
          const ticket = db
            .select({
              projectId: tickets.projectId,
              status: tickets.status,
              type: tickets.type,
              archived: tickets.archived,
              epicNumber: tickets.epicNumber,
              claimAgentRunId: tickets.claimAgentRunId,
              claimAgentName: tickets.claimAgentName,
            })
            .from(tickets)
            .where(eq(tickets.number, number))
            .get();
          if (!ticket) {
            throw new NotFoundError(`There is no Ticket T${number}.`);
          }
          if (ticket.projectId !== projectId) {
            throw new ValidationError({
              ticketNumbers: `Ticket T${number} is not in this Project.`,
            });
          }
          if (ticket.archived) {
            throw new ValidationError({
              ticketNumbers: `Ticket T${number} is archived. Restore it before moving it.`,
            });
          }
          if (ticket.type === 'Epic') {
            throw new ValidationError({
              ticketNumbers: epicStatusRule(number),
            });
          }
          return { number, ...ticket };
        });

        const rest = db
          .select({ number: tickets.number })
          .from(tickets)
          .where(
            and(eq(tickets.projectId, projectId), eq(tickets.status, status)),
          )
          .orderBy(
            asc(tickets.position),
            asc(tickets.createdAt),
            asc(tickets.number),
          )
          .all()
          .map(({ number }) => number)
          .filter((number) => !ticketNumbers.includes(number));
        const insertAt = before === null ? rest.length : rest.indexOf(before);
        if (insertAt < 0) {
          throw new ValidationError({
            before: 'Refresh the Board and try moving the Tickets again.',
          });
        }
        rest.splice(insertAt, 0, ...ticketNumbers);

        const now = new Date();
        rest.forEach((number, position) => {
          const moved = moving.find((ticket) => ticket.number === number);
          db.update(tickets)
            .set({
              position,
              ...(moved && moved.status !== status
                ? {
                    status,
                    updatedAt: now,
                    ...(status === 'Done'
                      ? { claimAgentRunId: null, claimAgentName: null }
                      : {}),
                  }
                : {}),
            })
            .where(eq(tickets.number, number))
            .run();
        });
        for (const ticket of moving) {
          if (ticket.status !== status) {
            recordActivity(ticket.number, [
              { type: 'status', from: ticket.status, to: status },
              ...(status === 'Done'
                ? claimChanges('claimReleased', ticket)
                : []),
            ]);
          }
          if (
            ticket.status !== status &&
            syncEpicStatus(ticket.epicNumber) &&
            ticket.epicNumber !== null
          ) {
            changedEpics.add(ticket.epicNumber);
          }
        }
      });
      changes.publish({
        type: 'tickets',
        numbers: [
          ...ticketNumbers,
          ...[...changedEpics].filter((epic) => !ticketNumbers.includes(epic)),
        ],
      });
    },
  };
}
