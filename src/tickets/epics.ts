import { and, asc, eq, isNotNull, ne, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import type { DatabaseConnection } from '../db/connection';
import { ticketBlockers, tickets } from '../db/schema';
import { claimOwner } from './claim-owner';
import { NotAllowedError, NotFoundError, ValidationError } from './errors';
import { nextPosition } from './positions';
import { checkBatchNumbers, eachOrNone, throwFieldErrors } from './rules';
import type { Status } from './status';
import type { TicketRowContext } from './ticket-row-context';
import type { TicketType } from './ticket-type';
import type { Ticket } from './tickets';

/** A Ticket to attach to, or detach from, an Epic (ADR 0011). */
export type EpicChildInput = { epic: number; child: number };

/** Tickets to move into an Epic together, each once, at most `maxBatchSize`. */
export type EpicChildrenInput = { epic: number; children: number[] };

/** The would-be child of an Epic: a new Ticket has no number yet. */
type ChildCandidate = {
  number?: number;
  type: TicketType;
  projectId: number;
  /** The Epic it is in already, if any. */
  epicNumber?: number | null;
};

/** `T42`, or `This Ticket` for one not created yet. */
function nameOf(number: number | undefined) {
  return number === undefined ? 'This Ticket' : `Ticket T${number}`;
}

/**
 * Throws unless Ticket `epicNumber` is an Epic that is not archived, so
 * Tickets may join it. Returns its Project.
 */
export function checkEpic(db: DatabaseConnection, epicNumber: number) {
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
    throw new NotFoundError(`There is no Ticket T${epicNumber}.`);
  }
  if (epic.type !== 'Epic') {
    throw new NotAllowedError(
      `Ticket T${epicNumber} is not an Epic. Only an Epic can have child Tickets.`,
    );
  }
  if (epic.archived) {
    throw new NotAllowedError(
      `Epic T${epicNumber} is archived. Restore it before adding Tickets to it.`,
    );
  }
  return { projectId: epic.projectId };
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
  const epic = checkEpic(db, epicNumber);
  if (child.type === 'Epic') {
    throw new NotAllowedError(
      `${child.number === undefined ? 'An Epic' : `Ticket T${child.number} is an Epic, and an Epic`} cannot be a child of another Epic.`,
    );
  }
  if (child.epicNumber != null && child.epicNumber !== epicNumber) {
    throw new NotAllowedError(
      `${nameOf(child.number)} is already in Epic T${child.epicNumber}. Detach it from that Epic first.`,
    );
  }
  if (epic.projectId !== child.projectId) {
    throw new NotAllowedError(
      child.number === undefined
        ? `Epic T${epicNumber} is in another Project. An Epic holds only its own Project's Tickets.`
        : `Ticket T${child.number} is in another Project than Epic T${epicNumber}. An Epic holds only its own Project's Tickets.`,
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
      `Ticket T${ticket.number} is in Epic T${ticket.epicNumber}. Detach it from its Epic before moving it to another Project.`,
    );
  }
  const child = db
    .select({ number: tickets.number })
    .from(tickets)
    .where(eq(tickets.epicNumber, ticket.number))
    .get();
  if (child) {
    throw new NotAllowedError(
      `Epic T${ticket.number} has child Tickets. Detach them before moving it to another Project.`,
    );
  }
}

/** Why Epic `number`'s Status cannot be set by hand. */
export function epicStatusRule(number: number) {
  return `Ticket T${number} is an Epic. Its Status follows its child Tickets and cannot be set by hand.`;
}

/**
 * An Epic's Status from its children: Todo with none or with every child
 * that is not archived in Todo, Done when every child is Done or archived,
 * and In progress otherwise. An archived child counts as finished, as an
 * archived Blocker is resolved (T595).
 */
export function derivedStatus(
  children: readonly { status: Status; archived: boolean }[],
): Status {
  const finished = (child: { status: Status; archived: boolean }) =>
    child.archived || child.status === 'Done';
  if (children.length > 0 && children.every(finished)) {
    return 'Done';
  }
  if (children.every((child) => child.archived || child.status === 'Todo')) {
    return 'Todo';
  }
  return 'In progress';
}

/**
 * Sets Epic `epicNumber`'s Status from its children by `derivedStatus`,
 * moving it to the end of a new Status lane. Run it in the transaction
 * that changed a child. Returns whether the Status changed.
 */
export function syncEpicStatus(
  db: DatabaseConnection,
  epicNumber: number | null,
): boolean {
  if (epicNumber === null) {
    return false;
  }
  const epic = db
    .select({ status: tickets.status, projectId: tickets.projectId })
    .from(tickets)
    .where(eq(tickets.number, epicNumber))
    .get();
  if (!epic) {
    return false;
  }
  const children = db
    .select({ status: tickets.status, archived: tickets.archived })
    .from(tickets)
    .where(eq(tickets.epicNumber, epicNumber))
    .all();
  const status = derivedStatus(children);
  if (status === epic.status) {
    return false;
  }
  db.update(tickets)
    .set({
      status,
      position: nextPosition(db, epic.projectId, status, epicNumber),
      // Reaching Done releases the Claim, as moving a Ticket there does.
      ...(status === 'Done'
        ? { claimAgentRunId: null, claimAgentName: null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(tickets.number, epicNumber))
    .run();
  return true;
}

/**
 * Throws if `blocker` and `blocked` are an Epic and one of its own children,
 * either way round: the children order themselves with Blockers among
 * themselves (ADR 0011).
 */
export function checkNotEpicAndChild(
  db: DatabaseConnection,
  { blocker, blocked }: { blocker: number; blocked: number },
) {
  const child = db
    .select({ number: tickets.number, epicNumber: tickets.epicNumber })
    .from(tickets)
    .where(
      or(
        and(eq(tickets.number, blocked), eq(tickets.epicNumber, blocker)),
        and(eq(tickets.number, blocker), eq(tickets.epicNumber, blocked)),
      ),
    )
    .get();
  if (child) {
    throw new ValidationError({
      blocker: `T${child.number} is a child of Epic T${child.epicNumber}. An Epic and its own children cannot block each other; order the children with Blockers among themselves.`,
    });
  }
}

/**
 * Throws if Ticket `child` blocks Epic `epic` or the other way round, so it
 * cannot join that Epic.
 */
export function checkNoBlockerBetween(
  db: DatabaseConnection,
  { epic, child }: EpicChildInput,
) {
  const blocker = db
    .select({
      blocker: ticketBlockers.blockerNumber,
      blocked: ticketBlockers.blockedNumber,
    })
    .from(ticketBlockers)
    .where(
      or(
        and(
          eq(ticketBlockers.blockerNumber, epic),
          eq(ticketBlockers.blockedNumber, child),
        ),
        and(
          eq(ticketBlockers.blockerNumber, child),
          eq(ticketBlockers.blockedNumber, epic),
        ),
      ),
    )
    .get();
  if (blocker) {
    throw new NotAllowedError(
      `T${blocker.blocker} blocks T${blocker.blocked}. An Epic and its own children cannot block each other; remove that Blocker first.`,
    );
  }
}

/** Throws if Epic `number` has children that are not archived. */
export function checkChildrenArchived(db: DatabaseConnection, number: number) {
  const unarchived = db
    .select({ number: tickets.number })
    .from(tickets)
    .where(and(eq(tickets.epicNumber, number), eq(tickets.archived, false)))
    .orderBy(asc(tickets.number))
    .all();
  if (unarchived.length > 0) {
    throw new NotAllowedError(
      `Epic T${number} has child Tickets that are not archived: ${unarchived.map((child) => `T${child.number}`).join(', ')}. Archive or detach them first.`,
    );
  }
}

const epics = alias(tickets, 'epics');

/**
 * A subquery of the numbers of claimed Epics, whose Claims cover their
 * children: what `listTickets` filters by.
 */
export function claimedEpics(db: DatabaseConnection) {
  return db
    .select({ number: epics.number })
    .from(epics)
    .where(and(eq(epics.type, 'Epic'), isNotNull(epics.claimAgentRunId)));
}

/**
 * Throws unless Agent run `agentRunId` may claim Ticket `number` as far as
 * Epics go (ADR 0011): a Done Epic has nothing left to claim, an Epic's
 * Claim covers its children, so neither may be held by another run when
 * the other is claimed. Run it in the claiming transaction.
 */
export function checkEpicClaimable(
  db: DatabaseConnection,
  number: number,
  agentRunId: string,
) {
  const ticket = db
    .select({
      type: tickets.type,
      status: tickets.status,
      epicNumber: tickets.epicNumber,
    })
    .from(tickets)
    .where(eq(tickets.number, number))
    .get();
  if (!ticket) {
    return;
  }
  if (ticket.type === 'Epic' && ticket.status === 'Done') {
    throw new NotAllowedError(
      `Epic T${number} is Done: all its child Tickets are Done, so there is nothing left to claim.`,
    );
  }
  if (ticket.epicNumber !== null) {
    const epic = db
      .select({
        claimAgentRunId: tickets.claimAgentRunId,
        claimAgentName: tickets.claimAgentName,
      })
      .from(tickets)
      .where(eq(tickets.number, ticket.epicNumber))
      .get();
    if (epic?.claimAgentRunId != null && epic.claimAgentRunId !== agentRunId) {
      throw new NotAllowedError(
        `Ticket T${number} is in Epic T${ticket.epicNumber}, which is claimed by ${claimOwner(epic.claimAgentRunId, epic.claimAgentName)}. Claiming an Epic covers its children.`,
      );
    }
  }
  if (ticket.type === 'Epic') {
    const child = db
      .select({
        number: tickets.number,
        claimAgentRunId: tickets.claimAgentRunId,
        claimAgentName: tickets.claimAgentName,
      })
      .from(tickets)
      .where(
        and(
          eq(tickets.epicNumber, number),
          isNotNull(tickets.claimAgentRunId),
          ne(tickets.claimAgentRunId, agentRunId),
        ),
      )
      .orderBy(asc(tickets.number))
      .get();
    if (child) {
      throw new NotAllowedError(
        `Epic T${number} has child Ticket T${child.number} claimed by ${claimOwner(child.claimAgentRunId, child.claimAgentName)}. Claiming an Epic covers its children, so that claim must be released first.`,
      );
    }
  }
}

/**
 * Throws if Ticket `number` is a child of an archived Epic, so it cannot be
 * restored: an archived Epic keeps only archived children.
 */
export function checkEpicNotArchived(db: DatabaseConnection, number: number) {
  const epic = db
    .select({ number: epics.number })
    .from(tickets)
    .innerJoin(epics, eq(epics.number, tickets.epicNumber))
    .where(and(eq(tickets.number, number), eq(epics.archived, true)))
    .get();
  if (epic) {
    throw new NotAllowedError(
      `Ticket T${number} is in Epic T${epic.number}, which is archived. Restore the Epic first.`,
    );
  }
}

/**
 * The Epic moves of the Tickets module (ADR 0011): attaching Tickets to an
 * Epic, moving them from another, and detaching them, each by the rules
 * above.
 */
export function createEpics(ctx: TicketRowContext) {
  const {
    db,
    changes,
    getTicket,
    recordActivity,
    touchTicket,
    checkTicketWritable,
  } = ctx;

  /**
   * The change of `joinEpic`, without its transaction or announcement: run
   * it in the transaction that makes the change. Returns `null` when `child`
   * was in `epic` already, and otherwise the Epic it left, if any.
   */
  function joinEpicStep(
    { epic, child }: EpicChildInput,
    { move }: { move: boolean },
  ): { previous: number | null } | null {
    checkTicketWritable(child);
    const ticket = db
      .select({
        type: tickets.type,
        projectId: tickets.projectId,
        epicNumber: tickets.epicNumber,
      })
      .from(tickets)
      .where(eq(tickets.number, child))
      .get();
    if (!ticket) {
      throw new NotFoundError(`There is no Ticket T${child}.`);
    }
    const previous = ticket.epicNumber;
    checkEpicChild(db, epic, {
      number: child,
      ...ticket,
      epicNumber: move ? null : previous,
    });
    if (previous === epic) {
      return null;
    }
    checkNoBlockerBetween(db, { epic, child });
    db.update(tickets)
      .set({ epicNumber: epic, archivedWithEpic: false, updatedAt: new Date() })
      .where(eq(tickets.number, child))
      .run();
    recordActivity(child, [{ type: 'epic', from: previous, to: epic }]);
    touchTicket(epic);
    syncEpicStatus(db, epic);
    if (previous !== null) {
      touchTicket(previous);
      syncEpicStatus(db, previous);
    }
    return { previous };
  }

  /**
   * Makes each of normal Tickets `children` a child of Epic `epic` in the
   * same Project (ADR 0011), and bumps both updated times, all or nothing:
   * if any cannot join `epic`, none does, and the refusal names every one that cannot and
   * why. A Ticket in another Epic is refused, not moved. Returns the
   * children in the order given. The change is announced once, or not at
   * all when every Ticket was in `epic` already.
   */
  function attachTicketsToEpic({ epic, children }: EpicChildrenInput) {
    throwFieldErrors({ children: checkBatchNumbers(children) });

    const joined = db.transaction(() => {
      checkEpic(db, epic);
      return eachOrNone(children, (child) =>
        joinEpicStep({ epic, child }, { move: false }),
      );
    });
    const changed = children.filter((_, index) => joined[index] !== null);
    if (changed.length > 0) {
      changes.publish({ type: 'tickets', numbers: [epic, ...changed] });
    }
    return children.map((child) => getTicket(child));
  }

  /**
   * `detachFromEpic` for each of `ticketNumbers`, all or nothing: if any
   * cannot leave its Epic, none does, and the refusal names every one. They
   * may come from different Epics, and each one's Status follows. A Ticket
   * in no Epic stays as it is. Returns the Tickets in the order given. The
   * change is announced once, or not at all when none was in an Epic.
   */
  function detachTicketsFromEpic(ticketNumbers: number[]): Ticket[] {
    throwFieldErrors({ ticketNumbers: checkBatchNumbers(ticketNumbers) });

    const left = db.transaction(() => eachOrNone(ticketNumbers, leaveEpicStep));
    const epics = left.filter((epic) => epic !== null);
    if (epics.length > 0) {
      changes.publish({
        type: 'tickets',
        numbers: [
          ...new Set(epics),
          ...ticketNumbers.filter((_, index) => left[index] !== null),
        ],
      });
    }
    return ticketNumbers.map((number) => getTicket(number));
  }

  /**
   * Takes Ticket `number` out of its Epic, without a transaction or an
   * announcement, and bumps both updated times. Returns the Epic it left,
   * or `null` when it was in none.
   */
  function leaveEpicStep(number: number): number | null {
    checkTicketWritable(number);
    const ticket = db
      .select({ epicNumber: tickets.epicNumber })
      .from(tickets)
      .where(eq(tickets.number, number))
      .get();
    if (!ticket) {
      throw new NotFoundError(`There is no Ticket T${number}.`);
    }
    if (ticket.epicNumber === null) {
      return null;
    }
    db.update(tickets)
      .set({ epicNumber: null, archivedWithEpic: false, updatedAt: new Date() })
      .where(eq(tickets.number, number))
      .run();
    recordActivity(number, [
      { type: 'epic', from: ticket.epicNumber, to: null },
    ]);
    touchTicket(ticket.epicNumber);
    syncEpicStatus(db, ticket.epicNumber);
    return ticket.epicNumber;
  }

  /**
   * Makes `child` a child of `epic`, by the rules of `attachTicketsToEpic`; with
   * `move`, a child of another Epic leaves that one first.
   */
  function joinEpic(
    { epic, child }: EpicChildInput,
    { move }: { move: boolean },
  ): Ticket {
    const changed = db.transaction(() =>
      joinEpicStep({ epic, child }, { move }),
    );
    if (changed) {
      changes.publish({
        type: 'tickets',
        numbers: [
          ...(changed.previous === null ? [] : [changed.previous]),
          epic,
          child,
        ],
      });
    }
    return getTicket(child);
  }

  return {
    attachTicketsToEpic,

    /**
     * Makes normal Ticket `child` a child of Epic `epic` in the same Project
     * (ADR 0011), by the rules of `attachTicketsToEpic`, but a Ticket in
     * another Epic leaves it for `epic`, and that Epic's Status follows too.
     * Returns the child.
     */
    moveToEpic(input: EpicChildInput): Ticket {
      return joinEpic(input, { move: true });
    },

    /**
     * `moveToEpic` for each of `children`, all or nothing: if any cannot
     * join `epic`, none does. Their Statuses and positions stay as they are.
     * The change is announced once, or not at all when every Ticket was in
     * `epic` already.
     */
    moveTicketsToEpic(input: EpicChildrenInput): void {
      const { epic, children } = input;
      throwFieldErrors({ children: checkBatchNumbers(children) });

      const joined = db.transaction(() =>
        children.flatMap((child) => {
          const changed = joinEpicStep({ epic, child }, { move: true });
          return changed ? [{ child, ...changed }] : [];
        }),
      );
      if (joined.length === 0) {
        return;
      }
      const left = joined.flatMap(({ previous }) =>
        previous === null ? [] : [previous],
      );
      changes.publish({
        type: 'tickets',
        numbers: [
          ...new Set([...left, epic, ...joined.map(({ child }) => child)]),
        ],
      });
    },

    /**
     * Takes Ticket `number` out of its Epic, if it has one, and bumps both
     * updated times. Returns the Ticket.
     */
    detachFromEpic(number: number): Ticket {
      return detachTicketsFromEpic([number])[0];
    },

    detachTicketsFromEpic,
  };
}
