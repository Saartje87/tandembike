import type {
  ConversationActivity,
  LiveConversation,
} from '../../conversations/conversation-activity';
import { isPullRequestReference } from '../../tickets/external-reference-display';
import type { Ticket } from '../../tickets/tickets';
import { type InProgressSection, laneOf } from '../board/board-lanes';

/** What every Cockpit row shows of its Ticket. */
export type CockpitTicket = Pick<
  Ticket,
  'number' | 'title' | 'epic' | 'updatedAt'
>;

/** An In progress Ticket: where it stands and what its run is doing. */
export type InFlightRow = CockpitTicket & {
  section: InProgressSection;
  /** Its live Conversation, or `undefined` without one. */
  live: LiveConversation | undefined;
  /** The USD cost over all its Conversations. */
  cost: number;
  /** Its latest pull request reference, or `null`. */
  pullRequest: string | null;
};

/** A ready-for-agent Todo Ticket, in the queue's order. */
export type QueuedRow = CockpitTicket & {
  blocked: boolean;
  /**
   * Its Blockers this Board does not show as Done or archived, by number:
   * those still open here, and those on another Board.
   */
  blockers: number[];
};

/** A Done Ticket, with what it cost and the pull request it ended in. */
export type DoneRow = CockpitTicket & {
  cost: number;
  pullRequest: string | null;
};

/**
 * A Board's Tickets as the Cockpit shows them. Needs you (T1105, T1107) and
 * Epic rows (T1108) are still to come.
 */
export type Cockpit = {
  inFlight: InFlightRow[];
  yourWork: CockpitTicket[];
  queued: QueuedRow[];
  done: DoneRow[];
  /** Done Tickets of all of them, Epics and archived Tickets left out. */
  progress: { done: number; total: number };
};

const byPosition = (left: Ticket, right: Ticket) =>
  left.position - right.position || left.number - right.number;

const rowOf = ({ number, title, epic, updatedAt }: Ticket): CockpitTicket => ({
  number,
  title,
  epic,
  updatedAt,
});

const latestPullRequest = (ticket: Ticket): string | null =>
  ticket.externalReferences.findLast(isPullRequestReference) ?? null;

/**
 * The Cockpit of a Board's `tickets`: those of a Cycle or of the Backlog. It
 * places each Ticket by the Board's own Lane derivation, so the two views
 * never disagree, and reads run state and cost from `activity`.
 */
export function cockpitOf(
  tickets: Ticket[],
  activity: Pick<ConversationActivity, 'live' | 'cost'>,
): Cockpit {
  const shown = tickets.filter(
    (ticket) => !ticket.archived && ticket.type !== 'Epic',
  );
  const resolved = new Set(
    tickets
      .filter((ticket) => ticket.archived || ticket.status === 'Done')
      .map(({ number }) => number),
  );
  const placed = shown
    .map((ticket) => ({
      ticket,
      live: activity.live[ticket.number],
    }))
    .map((entry) => ({ ...entry, ...laneOf(entry.ticket, entry.live) }))
    .sort((left, right) => byPosition(left.ticket, right.ticket));
  const inLane = (lane: string) =>
    placed.filter((entry) => entry.lane === lane);
  const cost = (ticket: Ticket) => activity.cost[ticket.number] ?? 0;

  return {
    inFlight: inLane('In progress').map(({ ticket, live, section }) => ({
      ...rowOf(ticket),
      section: section ?? 'Running',
      live,
      cost: cost(ticket),
      pullRequest: latestPullRequest(ticket),
    })),
    yourWork: inLane('For human').map(({ ticket }) => rowOf(ticket)),
    queued: inLane('Todo').map(({ ticket }) => ({
      ...rowOf(ticket),
      blocked: ticket.blocked,
      blockers: ticket.blocked
        ? ticket.blockedBy.filter((number) => !resolved.has(number))
        : [],
    })),
    done: inLane('Done')
      .map(({ ticket }) => ({
        ...rowOf(ticket),
        cost: cost(ticket),
        pullRequest: latestPullRequest(ticket),
      }))
      .sort(
        (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
      ),
    progress: {
      done: shown.filter(({ status }) => status === 'Done').length,
      total: shown.length,
    },
  };
}
