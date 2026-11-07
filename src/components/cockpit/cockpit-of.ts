import type {
  ConversationActivity,
  LiveConversation,
} from '../../conversations/conversation-activity';
import { isPullRequestReference } from '../../tickets/external-reference-display';
import type { PaletteColor } from '../../tickets/palette';
import type { Status } from '../../tickets/status';
import type { Ticket } from '../../tickets/tickets';
import { isTriageStateLabel } from '../../tickets/triage-labels';
import {
  type BoardLane,
  type InProgressSection,
  laneOf,
} from '../board/board-lanes';
import { epicCost } from '../conversation-activity/epic-cost';

/** What every Cockpit row shows of its Ticket. */
export type CockpitTicket = Pick<
  Ticket,
  'number' | 'title' | 'epic' | 'updatedAt'
> & {
  /** An Epic's own colour; `null` for a normal Ticket. */
  color: PaletteColor | null;
  /**
   * For an Epic outside In flight (Queued, Your work, Done), its children and
   * whether one needs the User; absent for a normal Ticket.
   */
  children?: EpicChildRow[];
  childNeedsYou?: boolean;
};

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

/** Where a child of an Epic stands, for its Epic's row. */
export type EpicChildState =
  | 'done'
  | 'running'
  | 'needs-you'
  | 'review'
  | 'queued';

/** A child of an Epic, as its Epic's row lists it. */
export type EpicChildRow = {
  number: number;
  title: string;
  state: EpicChildState;
};

/** An In progress Epic: its own run, and how far its children are. */
export type EpicRow = InFlightRow & {
  color: PaletteColor;
  /** Its unarchived children, in the Epic's order, each with its state. */
  children: EpicChildRow[];
  /** Whether one of its children is in Needs you. */
  childNeedsYou: boolean;
};

/** A Todo or Done Epic's children, for its row in Queued, Your work or Done. */
type EpicChildren = Required<Pick<CockpitTicket, 'children' | 'childNeedsYou'>>;

/** A ready-for-agent Todo Ticket, in the queue's order. */
export type QueuedRow = CockpitTicket & {
  blocked: boolean;
  /**
   * Its Blockers this Board does not show as Done or archived, by number:
   * those still open here, and those on another Board.
   */
  blockers: number[];
};

/** What a Ticket in Needs you waits on. */
export type NeedKind =
  | 'waiting'
  | 'idle'
  | 'failed'
  | 'interrupted'
  | 'stalled'
  | 'review'
  | 'intake';

/** A Ticket that needs the User, and since when. */
export type NeedRow = CockpitTicket & {
  kind: NeedKind;
  /** Its live Conversation, or `undefined` without one. */
  live: LiveConversation | undefined;
  /**
   * Since when it waits: for Intake, its creation; else its live
   * Conversation's run start, or its latest change.
   */
  since: Date;
  pullRequest: string | null;
  /** For Intake, its triage state label, `null` without one. */
  triageLabel: string | null;
};

/** A Done Ticket, with what it cost and the pull request it ended in. */
export type DoneRow = CockpitTicket & {
  cost: number;
  pullRequest: string | null;
};

/** A Board's Tickets as the Cockpit shows them. */
export type Cockpit = {
  /** What waits on the User, each group longest waiting first. */
  needsYou: {
    actionNeeded: NeedRow[];
    review: NeedRow[];
    /** Todo Tickets still to triage, from this Board and the other given. */
    intake: NeedRow[];
    /** How many Tickets wait on the User in all. */
    count: number;
  };
  /**
   * The In progress Epics, in Board order, in whatever section they are.
   * Epics in Todo or Done are rows of Queued, Your work or Done instead.
   */
  epics: EpicRow[];
  /** The Running Tickets outside those Epics, in Board order. */
  inFlight: InFlightRow[];
  yourWork: CockpitTicket[];
  queued: QueuedRow[];
  done: DoneRow[];
  /** Done Tickets of all of them, Epics and archived Tickets left out. */
  progress: { done: number; total: number };
};

const byPosition = (left: Ticket, right: Ticket) =>
  left.position - right.position || left.number - right.number;

/** An Epic's colour: every Epic has one; grey only stands in should it lack it. */
const epicColorOf = (epic: Ticket): PaletteColor => epic.color ?? 'grey';

const rowOf = (ticket: Ticket): CockpitTicket => ({
  number: ticket.number,
  title: ticket.title,
  epic: ticket.epic,
  updatedAt: ticket.updatedAt,
  color: ticket.type === 'Epic' ? epicColorOf(ticket) : null,
});

/** Where a child stands when it is on another Board: its Status says it all. */
const childStateByStatus: Record<Status, EpicChildState> = {
  Todo: 'queued',
  'In progress': 'running',
  Done: 'done',
};

/** Where an In progress child on this Board stands, by its section. */
const childStateBySection: Record<InProgressSection, EpicChildState> = {
  Running: 'running',
  Review: 'review',
  'Action needed': 'needs-you',
};

const latestPullRequest = (ticket: Ticket): string | null =>
  ticket.externalReferences.findLast(isPullRequestReference) ?? null;

/**
 * The kind of an Action needed Ticket by its live Conversation's state. A
 * running Conversation puts its Ticket in Running, never here.
 */
const liveKind: Record<
  Exclude<LiveConversation['state'], 'running'>,
  Exclude<NeedKind, 'intake'>
> = {
  waiting: 'waiting',
  idle: 'idle',
  error: 'failed',
  interrupted: 'interrupted',
};

const needRowOf = (
  ticket: Ticket,
  live: LiveConversation | undefined,
  kind: Exclude<NeedKind, 'intake'>,
): NeedRow => ({
  ...rowOf(ticket),
  kind,
  live,
  since: live ? new Date(live.since) : ticket.updatedAt,
  pullRequest: latestPullRequest(ticket),
  triageLabel: null,
});

/** An Intake Ticket as a Needs you row: waiting since it was filed. */
const intakeRowOf = (ticket: Ticket): NeedRow => ({
  ...rowOf(ticket),
  kind: 'intake',
  live: undefined,
  since: ticket.createdAt,
  pullRequest: null,
  triageLabel: ticket.labels.find(isTriageStateLabel) ?? null,
});

const isShown = (ticket: Ticket) => !ticket.archived && ticket.type !== 'Epic';

const longestWaitingFirst = (left: NeedRow, right: NeedRow) =>
  left.since.getTime() - right.since.getTime() || left.number - right.number;

/**
 * The Cockpit of a Board's `tickets`: those of a Cycle or of the Backlog. It
 * places each Ticket by the Board's own Lane derivation, so the two views
 * never disagree, and reads run state and cost from `activity`. Of
 * `intakeElsewhere`, another Board's Tickets, only the Intake joins Needs you:
 * on a Cycle's Cockpit, the Backlog's, where runs file their feedback.
 */
export function cockpitOf(
  tickets: Ticket[],
  activity: Pick<ConversationActivity, 'live' | 'cost'>,
  intakeElsewhere: Ticket[] = [],
): Cockpit {
  const shown = tickets.filter(isShown);
  // Every Epic is placed by its lane; an Epic in Intake is not shown (yet).
  const allEpics = tickets
    .filter((ticket) => ticket.type === 'Epic' && !ticket.archived)
    .map((epic) => ({ epic, live: activity.live[epic.number] }))
    .map((entry) => ({ ...entry, ...laneOf(entry.epic, entry.live) }))
    .filter((entry) => entry.lane !== 'Intake')
    .sort((left, right) => byPosition(left.epic, right.epic));
  const epics = allEpics.filter((entry) => entry.lane === 'In progress');
  const shownEpics = new Set(allEpics.map(({ epic }) => epic.number));
  // A child of a shown Epic is in its row, not a row of its own (Needs you aside).
  const isNested = (ticket: Ticket) =>
    ticket.epic !== null && shownEpics.has(ticket.epic.number);
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
  /** The lane's Tickets that get a row of their own, with its Epics among them. */
  const rowsIn = (lane: BoardLane) =>
    [
      ...inLane(lane).filter(({ ticket }) => !isNested(ticket)),
      ...allEpics
        .filter((entry) => entry.lane === lane)
        .map(({ epic, live, lane, section }) => ({
          ticket: epic,
          live,
          lane,
          section,
        })),
    ].sort((left, right) => byPosition(left.ticket, right.ticket));
  const cost = (ticket: Ticket) => activity.cost[ticket.number] ?? 0;
  const inSection = (section: InProgressSection) =>
    inLane('In progress').filter((entry) => entry.section === section);
  const epicsIn = (section: InProgressSection) =>
    epics
      .filter((entry) => entry.section === section)
      .map(({ epic, live }) => ({ ticket: epic, live }));
  const actionNeeded = [
    ...inSection('Action needed'),
    ...epicsIn('Action needed'),
  ]
    .map(({ ticket, live }) =>
      needRowOf(
        ticket,
        live,
        live && live.state !== 'running' ? liveKind[live.state] : 'stalled',
      ),
    )
    .sort(longestWaitingFirst);
  const review = [...inSection('Review'), ...epicsIn('Review')]
    .map(({ ticket, live }) => needRowOf(ticket, live, 'review'))
    .sort(longestWaitingFirst);
  const intake = [
    ...inLane('Intake').map(({ ticket }) => ticket),
    ...intakeElsewhere.filter(
      (ticket) => isShown(ticket) && laneOf(ticket).lane === 'Intake',
    ),
  ]
    .map(intakeRowOf)
    .sort(longestWaitingFirst);
  const needsYouNumbers = new Set(
    [...actionNeeded, ...review].map(({ number }) => number),
  );
  const childStateOf = (child: Ticket['children'][number]): EpicChildState => {
    const entry = placed.find(({ ticket }) => ticket.number === child.number);
    if (!entry) {
      return childStateByStatus[child.status];
    }
    if (entry.lane === 'In progress' && entry.section) {
      return childStateBySection[entry.section];
    }
    return entry.lane === 'Done' ? 'done' : 'queued';
  };
  const childrenOf = (epic: Ticket): EpicChildren => {
    const children = epic.children.filter(({ archived }) => !archived);
    return {
      children: children.map((child) => ({
        number: child.number,
        title: child.title,
        state: childStateOf(child),
      })),
      childNeedsYou: children.some(({ number }) => needsYouNumbers.has(number)),
    };
  };
  /** A Todo or Done row of `ticket`: an Epic's carries its children. */
  const withChildren = (ticket: Ticket) =>
    ticket.type === 'Epic' ? childrenOf(ticket) : {};
  const epicRowOf = ({
    epic,
    live,
    section,
  }: (typeof epics)[number]): EpicRow => ({
    ...rowOf(epic),
    ...childrenOf(epic),
    color: epicColorOf(epic),
    section: section ?? 'Running',
    live,
    // As the Board counts it, archived children's runs included (T1066).
    cost: epicCost(epic, activity.cost),
    pullRequest: latestPullRequest(epic),
  });
  const costOf = (ticket: Ticket) =>
    ticket.type === 'Epic' ? epicCost(ticket, activity.cost) : cost(ticket);

  return {
    needsYou: {
      actionNeeded,
      review,
      intake,
      count: actionNeeded.length + review.length + intake.length,
    },
    epics: epics.map(epicRowOf),
    inFlight: inSection('Running')
      .filter(({ ticket }) => !isNested(ticket))
      .map(({ ticket, live, section }) => ({
        ...rowOf(ticket),
        section: section ?? 'Running',
        live,
        cost: cost(ticket),
        pullRequest: latestPullRequest(ticket),
      })),
    yourWork: rowsIn('For human').map(({ ticket }) => ({
      ...rowOf(ticket),
      ...withChildren(ticket),
    })),
    queued: rowsIn('Todo').map(({ ticket }) => ({
      ...rowOf(ticket),
      ...withChildren(ticket),
      blocked: ticket.blocked,
      blockers: ticket.blocked
        ? ticket.blockedBy.filter((number) => !resolved.has(number))
        : [],
    })),
    done: rowsIn('Done')
      .map(({ ticket }) => ({
        ...rowOf(ticket),
        ...withChildren(ticket),
        cost: costOf(ticket),
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
