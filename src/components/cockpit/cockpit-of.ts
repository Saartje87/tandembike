import type {
  ConversationActivity,
  LiveConversation,
} from '../../conversations/conversation-activity';
import { isPullRequestReference } from '../../tickets/external-reference-display';
import type { Ticket } from '../../tickets/tickets';
import {
  type BoardLane,
  type InProgressSection,
  laneOf,
} from '../board/board-lanes';

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

/** What an Action needed or Review Ticket waits on. */
export type NeedKind =
  | 'waiting'
  | 'failed'
  | 'interrupted'
  | 'stalled'
  | 'review';

/** A Ticket that needs the User, and since when. */
export type NeedRow = CockpitTicket & {
  kind: NeedKind;
  /** Its live Conversation, or `undefined` without one. */
  live: LiveConversation | undefined;
  /**
   * Since when it waits: its live Conversation's run start, else its latest
   * change.
   */
  since: Date;
  pullRequest: string | null;
};

/** A Done Ticket, with what it cost and the pull request it ended in. */
export type DoneRow = CockpitTicket & {
  cost: number;
  pullRequest: string | null;
};

/**
 * A Board's Tickets as the Cockpit shows them. Intake in Needs you (T1107)
 * and Epic rows (T1108) are still to come.
 */
export type Cockpit = {
  /** What waits on the User, each group longest waiting first. */
  needsYou: {
    actionNeeded: NeedRow[];
    review: NeedRow[];
    /** How many Tickets wait on the User in all. */
    count: number;
  };
  /** The Running Tickets, in Board order. */
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
 * The kind of an Action needed Ticket by its live Conversation's state. A
 * running Conversation puts its Ticket in Running, never here.
 */
const liveKind: Record<
  Exclude<LiveConversation['state'], 'running'>,
  NeedKind
> = {
  waiting: 'waiting',
  error: 'failed',
  interrupted: 'interrupted',
};

const needRowOf = (
  ticket: Ticket,
  live: LiveConversation | undefined,
  kind: NeedKind,
): NeedRow => ({
  ...rowOf(ticket),
  kind,
  live,
  since: live ? new Date(live.since) : ticket.updatedAt,
  pullRequest: latestPullRequest(ticket),
});

const longestWaitingFirst = (left: NeedRow, right: NeedRow) =>
  left.since.getTime() - right.since.getTime() || left.number - right.number;

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
  const inLane = (lane: BoardLane) =>
    placed.filter((entry) => entry.lane === lane);
  const cost = (ticket: Ticket) => activity.cost[ticket.number] ?? 0;
  const inSection = (section: InProgressSection) =>
    inLane('In progress').filter((entry) => entry.section === section);
  const actionNeeded = inSection('Action needed')
    .map(({ ticket, live }) =>
      needRowOf(
        ticket,
        live,
        live && live.state !== 'running' ? liveKind[live.state] : 'stalled',
      ),
    )
    .sort(longestWaitingFirst);
  const review = inSection('Review')
    .map(({ ticket, live }) => needRowOf(ticket, live, 'review'))
    .sort(longestWaitingFirst);

  return {
    needsYou: {
      actionNeeded,
      review,
      count: actionNeeded.length + review.length,
    },
    inFlight: inSection('Running').map(({ ticket, live, section }) => ({
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
