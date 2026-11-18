import type { Cycle } from './cycles';
import { NotAllowedError } from './errors';
import { throwFieldErrors } from './rules';
import type { TicketRowContext } from './ticket-row-context';
import type {
  AddCommentInput,
  Comment,
  Ticket,
  TicketChange,
  UpdatedTicket,
} from './tickets';

export type AddOverlapBlockerInput = {
  /** The Project of the Overlap planning run. */
  projectId: number;
  /** The Active Cycle the run plans; refused once another is Active. */
  cycleId: number;
  /** The Ticket or Epic that goes first: the one higher on the Board. */
  blocker: number;
  /** The Ticket or Epic that waits for it. */
  blocked: number;
  /** The files or modules both would touch, as the comment names them. */
  sharedCode: string;
};

type OverlapBlockerDeps = {
  activeCycle: (projectId: number) => Cycle | null;
  updateTicket: (number: number, change: TicketChange) => UpdatedTicket;
  addComment: (number: number, input: AddCommentInput) => Comment;
};

const readyLabel = 'ready-for-agent';

/** Why `ticket` is not a candidate of Overlap planning in Cycle `cycleId`, or null. */
function notCandidate(
  ticket: Ticket,
  projectId: number,
  cycleId: number,
): string | null {
  if (ticket.projectId !== projectId) {
    return 'it is in another Project';
  }
  if (ticket.archived) {
    return 'it is archived';
  }
  if (ticket.epic !== null) {
    return `it is a child of T${ticket.epic.number}: compare its Epic as a whole`;
  }
  if (ticket.cycle?.id !== cycleId) {
    return 'it is not planned in the Active Cycle';
  }
  if (ticket.status !== 'Todo') {
    return `it is ${ticket.status}`;
  }
  if (ticket.claim !== null) {
    return 'it is claimed';
  }
  if (!ticket.labels.includes(readyLabel)) {
    return `it is not labelled ${readyLabel}`;
  }
  return null;
}

/** Whether `a` is above `b` in the Board's Todo lane: by position, then age, then number. */
const isAbove = (a: Ticket, b: Ticket): boolean =>
  a.position !== b.position
    ? a.position < b.position
    : a.createdAt.getTime() !== b.createdAt.getTime()
      ? a.createdAt < b.createdAt
      : a.number < b.number;

/**
 * Overlap planning's one write (ADR 0054): a native Blocker between two
 * candidates of the Active Cycle, the one higher on the Board first, and a
 * comment on the blocked one naming the other and the shared code. It never
 * removes a Blocker or changes Status, labels or order.
 */
export function createOverlapBlockers(
  { getTicket, transaction }: TicketRowContext,
  deps: OverlapBlockerDeps,
) {
  return {
    /**
     * Blocks `blocked` on `blocker`, both candidates of Overlap planning in
     * the Project's Active Cycle `cycleId`: Todo, unclaimed, not archived,
     * not an Epic's child and labelled ready-for-agent. `blocker` must be
     * higher on the Board. A Blocker already there is left as it is, with no
     * second comment; a Blocker cycle is refused. Returns the blocked Ticket.
     */
    addOverlapBlocker(input: AddOverlapBlockerInput): Ticket {
      const sharedCode = input.sharedCode?.trim() ?? '';
      throwFieldErrors({
        sharedCode:
          sharedCode === ''
            ? 'Name the files or modules both Tickets would touch.'
            : undefined,
      });
      if (deps.activeCycle(input.projectId)?.id !== input.cycleId) {
        throw new NotAllowedError(
          'The Cycle this run plans is no longer Active, so it adds no Blockers.',
        );
      }
      if (input.blocker === input.blocked) {
        throw new NotAllowedError('A Ticket cannot block itself.');
      }
      const blocker = getTicket(input.blocker);
      const blocked = getTicket(input.blocked);
      for (const ticket of [blocker, blocked]) {
        const reason = notCandidate(ticket, input.projectId, input.cycleId);
        if (reason !== null) {
          throw new NotAllowedError(
            `T${ticket.number} is not a candidate of Overlap planning: ${reason}.`,
          );
        }
      }
      if (!isAbove(blocker, blocked)) {
        throw new NotAllowedError(
          `T${blocker.number} is below T${blocked.number} on the Board: the Blocker must be the Ticket higher on the Board, so it goes first.`,
        );
      }
      if (blocked.blockedBy.includes(blocker.number)) {
        return blocked;
      }
      return transaction(() => {
        deps.updateTicket(blocked.number, { addBlockers: [blocker.number] });
        deps.addComment(blocked.number, {
          author: 'agent',
          body: `Overlap planning blocked this ${blocked.type} on T${blocker.number} ("${blocker.title}"), which is higher on the Board, so they run one after the other: both would touch ${sharedCode}. Remove the Blocker if they can run at the same time.`,
        });
        return getTicket(blocked.number);
      });
    },
  };
}
