import { and, asc, eq, isNotNull, ne, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import type { DatabaseConnection } from '../db/connection';
import { ticketBlockers, tickets } from '../db/schema';
import { claimOwner } from './claim-owner';
import { NotAllowedError, NotFoundError, ValidationError } from './errors';
import { nextPosition } from './positions';
import type { Status } from './status';
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

/**
 * An Epic's Status from its children's: Todo with none or all Todo, Done
 * when all are Done, and In progress otherwise.
 */
export function derivedStatus(children: readonly Status[]): Status {
  if (children.every((status) => status === 'Todo')) {
    return 'Todo';
  }
  if (children.every((status) => status === 'Done')) {
    return 'Done';
  }
  return 'In progress';
}

/**
 * Sets Epic `epicNumber`'s Status from its children that are not archived,
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
  const status = derivedStatus(
    db
      .select({ status: tickets.status })
      .from(tickets)
      .where(
        and(eq(tickets.epicNumber, epicNumber), eq(tickets.archived, false)),
      )
      .all()
      .map((child) => child.status),
  );
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
      blocker: `#${child.number} is a child of Epic #${child.epicNumber}. An Epic and its own children cannot block each other; order the children with Blockers among themselves.`,
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
      `#${blocker.blocker} blocks #${blocker.blocked}. An Epic and its own children cannot block each other; remove that Blocker first.`,
    );
  }
}

/** Throws if Epic `number` has children that are not archived. */
export function checkNoLiveChildren(db: DatabaseConnection, number: number) {
  const live = db
    .select({ number: tickets.number })
    .from(tickets)
    .where(and(eq(tickets.epicNumber, number), eq(tickets.archived, false)))
    .orderBy(asc(tickets.number))
    .all();
  if (live.length > 0) {
    throw new NotAllowedError(
      `Epic #${number} has child Tickets that are not archived: ${live.map((child) => `#${child.number}`).join(', ')}. Archive or detach them first.`,
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
      `Epic #${number} is Done: all its child Tickets are Done, so there is nothing left to claim.`,
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
        `Ticket #${number} is in Epic #${ticket.epicNumber}, which is claimed by ${claimOwner(epic.claimAgentRunId, epic.claimAgentName)}. Claiming an Epic covers its children.`,
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
        `Epic #${number} has child Ticket #${child.number} claimed by ${claimOwner(child.claimAgentRunId, child.claimAgentName)}. Claiming an Epic covers its children, so that claim must be released first.`,
      );
    }
  }
}
