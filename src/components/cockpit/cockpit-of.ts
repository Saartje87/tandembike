import { type BoardFilter, noBoardFilter } from '../../app/lib/paths';
import type {
  ConversationActivity,
  LiveConversation,
} from '../../conversations/conversation-activity';
import { isPullRequestReference } from '../../tickets/external-reference-display';
import type { PaletteColor } from '../../tickets/palette';
import type { Ticket } from '../../tickets/tickets';
import {
  isRowLabel,
  isTriageStateLabel,
  readyForAgent,
} from '../../tickets/triage-labels';
import { isFiltering, ticketMatches } from '../board/board-filter';
import {
  type BoardLane,
  type InProgressSection,
  inheritsSection,
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
  /** Its labels the row shows, in its order: those `isRowLabel` keeps. */
  labels: string[];
  /**
   * For an Epic row outside In flight (Needs you, Queued, Your work, Done),
   * its children on this Board, how many more are elsewhere, and whether one
   * needs the User; absent for a normal Ticket.
   */
  children?: EpicChildRow[];
  childrenElsewhere?: number;
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

/**
 * Where a child of an Epic stands, for its Epic's row. `built` is an In
 * progress child whose acceptance criteria are all checked: finished on the
 * Epic's branch, waiting for the Epic to merge (T1144).
 */
export type EpicChildState =
  | 'done'
  | 'built'
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
  /** Its unarchived children on this Board, in the Epic's order, each with its state. */
  children: EpicChildRow[];
  /** How many of its unarchived children are on another Board. */
  childrenElsewhere: number;
  /** Whether one of its children is in Needs you. */
  childNeedsYou: boolean;
};

/** An Epic's children, for its row outside In flight. */
type EpicChildren = Required<
  Pick<CockpitTicket, 'children' | 'childrenElsewhere' | 'childNeedsYou'>
>;

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
    /** This Board's Todo Tickets still to triage. */
    intake: NeedRow[];
    /** How many Tickets wait on the User, under the Board filter. */
    count: number;
    /** How many wait on the User in all, whatever the Board filter. */
    total: number;
  };
  /**
   * The Running Epics (In progress, their run going), in Board order. An Epic
   * in Review or Action needed is a row of Needs you instead, as is one in
   * Intake; Epics in Todo or Done are rows of Queued, Your work or Done.
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

/** What every row shows of `ticket`; an archived row too. */
export const rowOf = (ticket: Ticket): CockpitTicket => ({
  number: ticket.number,
  title: ticket.title,
  epic: ticket.epic,
  updatedAt: ticket.updatedAt,
  color: ticket.type === 'Epic' ? epicColorOf(ticket) : null,
  labels: ticket.labels.filter(isRowLabel),
});

/** Where an In progress child on this Board stands, by its section. */
const childStateBySection: Record<InProgressSection, EpicChildState> = {
  Running: 'running',
  Review: 'review',
  'Action needed': 'needs-you',
};

/**
 * Whether an In progress child is finished on its Epic's branch: it has
 * acceptance criteria and every one is checked. Only its Epic's row reads it;
 * the child keeps its own Lane and section.
 */
const isBuilt = (ticket: Ticket): boolean =>
  ticket.status === 'In progress' &&
  ticket.acceptanceCriteria.length > 0 &&
  ticket.acceptanceCriteria.every(({ checked }) => checked);

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

/**
 * An Intake Ticket as a Needs you row: waiting since it was filed. Its triage
 * label is `ready-for-agent` whenever it carries it, as the Lane derivation
 * reads it: only an Epic without children is in Intake with it (ADR 0027).
 */
const intakeRowOf = (ticket: Ticket): NeedRow => ({
  ...rowOf(ticket),
  kind: 'intake',
  live: undefined,
  since: ticket.createdAt,
  pullRequest: null,
  triageLabel: ticket.labels.includes(readyForAgent)
    ? readyForAgent
    : (ticket.labels.find(isTriageStateLabel) ?? null),
});

const isShown = (ticket: Ticket) => !ticket.archived && ticket.type !== 'Epic';

/**
 * Whether the Board filter keeps `ticket`: it matches, or it is an Epic and
 * one of its children on this Board, found in `onBoard`, does.
 */
function keeps(
  ticket: Ticket,
  filter: BoardFilter,
  onBoard: Map<number, Ticket>,
): boolean {
  return (
    ticketMatches(ticket, filter) ||
    ticket.children.some((child) => {
      const known = onBoard.get(child.number);
      return known !== undefined && ticketMatches(known, filter);
    })
  );
}

const longestWaitingFirst = (left: NeedRow, right: NeedRow) =>
  left.since.getTime() - right.since.getTime() || left.number - right.number;

/**
 * The Cockpit of a Board's `tickets`: those of a Cycle or of the Backlog, and
 * nothing else (ADR 0025). It places each Ticket by the Board's own Lane
 * derivation, so the two views never disagree, and reads run state and cost
 * from `activity`. An Epic's row lists only its children on this Board, and
 * counts the others as `childrenElsewhere`; its cost still covers them all.
 *
 * The Board `filter` narrows every section: a row stays when its Ticket
 * matches, and an Epic's row also when one of its children here does, then
 * listing only the matching children (all of them when the Epic matches
 * itself). `needsYou.count` and the lists follow the filter;
 * `needsYou.total`, and the `progress`, do not.
 */
export function cockpitOf(
  tickets: Ticket[],
  activity: Pick<ConversationActivity, 'live' | 'cost'>,
  filter: BoardFilter = noBoardFilter,
): Cockpit {
  const onBoard = new Map(tickets.map((ticket) => [ticket.number, ticket]));
  const shown = tickets.filter(isShown);
  // Every Epic is placed by its lane, like a Ticket.
  const allEpics = tickets
    .filter((ticket) => ticket.type === 'Epic' && !ticket.archived)
    .map((epic) => ({ epic, live: activity.live[epic.number] }))
    .map((entry) => ({ ...entry, ...laneOf(entry.epic, entry.live) }))
    .sort((left, right) => byPosition(left.epic, right.epic));
  const epics = allEpics.filter(
    (entry) => entry.lane === 'In progress' && entry.section === 'Running',
  );
  const shownEpics = new Set(allEpics.map(({ epic }) => epic.number));
  // A child of a shown Epic is in its row, not a row of its own (Needs you aside).
  const isNested = (ticket: Ticket) =>
    ticket.epic !== null && shownEpics.has(ticket.epic.number);
  const runningEpics = new Set(
    allEpics
      .filter(({ lane }) => lane === 'In progress')
      .map(({ epic }) => epic.number),
  );
  // In Needs you too, when it is placed by its In progress Epic's run: the
  // Epic's row, in Needs you or In flight, carries it (T1143).
  const isFolded = ({
    ticket,
    inherited,
  }: {
    ticket: Ticket;
    inherited: boolean;
  }) =>
    inherited && ticket.epic !== null && runningEpics.has(ticket.epic.number);
  const resolved = new Set(
    tickets
      .filter((ticket) => ticket.archived || ticket.status === 'Done')
      .map(({ number }) => number),
  );
  // A child with no run state of its own is placed by its Epic's (T1143).
  const placed = shown
    .map((ticket) => ({
      ticket,
      live: activity.live[ticket.number],
    }))
    .map((entry) => ({
      ...entry,
      ...laneOf(
        entry.ticket,
        entry.live,
        entry.ticket.epic ? activity.live[entry.ticket.epic.number] : undefined,
      ),
      inherited: inheritsSection(entry.ticket, entry.live),
    }))
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
  /** The section's Tickets that need the User in a row of their own. */
  const needInSection = (section: InProgressSection) =>
    inSection(section).filter((entry) => !isFolded(entry));
  const epicsIn = (section: InProgressSection) =>
    allEpics
      .filter((entry) => entry.section === section)
      .map(({ epic, live }) => ({ ticket: epic, live }));
  const actionNeeded = [
    ...needInSection('Action needed'),
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
  const review = [...needInSection('Review'), ...epicsIn('Review')]
    .map(({ ticket, live }) => needRowOf(ticket, live, 'review'))
    .sort(longestWaitingFirst);
  const needsYouNumbers = new Set(
    [...actionNeeded, ...review].map(({ number }) => number),
  );
  const childStateOf = (entry: (typeof placed)[number]): EpicChildState => {
    // A child's own run outranks built: it is still being worked, or it needs
    // the User. A section it only inherits from its Epic's run does not.
    const ownRun =
      !entry.inherited &&
      (entry.section === 'Running' || entry.section === 'Action needed');
    if (!ownRun && isBuilt(entry.ticket)) {
      return 'built';
    }
    if (entry.lane === 'In progress' && entry.section) {
      return childStateBySection[entry.section];
    }
    return entry.lane === 'Done' ? 'done' : 'queued';
  };
  const childrenOf = (epic: Ticket): EpicChildren => {
    const unarchived = epic.children.filter(({ archived }) => !archived);
    const here = unarchived.flatMap((child) => {
      const entry = placed.find(({ ticket }) => ticket.number === child.number);
      return entry ? [{ child, entry }] : [];
    });
    return {
      children: here.map(({ child, entry }) => ({
        number: child.number,
        title: child.title,
        state: childStateOf(entry),
      })),
      childrenElsewhere: unarchived.length - here.length,
      childNeedsYou: here.some(({ child }) =>
        needsYouNumbers.has(child.number),
      ),
    };
  };
  /** A row of `ticket` outside In flight: an Epic's carries its children. */
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

  // Intake: in its Board order, which a drag sets, Epics among them, their
  // children in their rows.
  const intakeEpics = new Set(
    allEpics
      .filter(({ lane }) => lane === 'Intake')
      .map(({ epic }) => epic.number),
  );
  const inIntakeEpic = (ticket: Ticket) =>
    ticket.epic !== null && intakeEpics.has(ticket.epic.number);
  const intakeRow = (ticket: Ticket) => ({
    ...intakeRowOf(ticket),
    ...withChildren(ticket),
  });
  const intake = [
    ...inLane('Intake').map(({ ticket }) => ticket),
    ...allEpics
      .filter((entry) => entry.lane === 'Intake')
      .map(({ epic }) => epic),
  ]
    .filter((ticket) => !inIntakeEpic(ticket))
    .sort(byPosition)
    .map(intakeRow);
  const needsYouRow = (row: NeedRow): NeedRow => {
    const epic = allEpics.find(({ epic }) => epic.number === row.number);
    return epic ? { ...row, ...childrenOf(epic.epic) } : row;
  };

  const unfiltered: Cockpit = {
    needsYou: {
      actionNeeded: actionNeeded.map(needsYouRow),
      review: review.map(needsYouRow),
      intake,
      count: actionNeeded.length + review.length + intake.length,
      total: actionNeeded.length + review.length + intake.length,
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
    yourWork: rowsIn('Your work').map(({ ticket }) => ({
      ...rowOf(ticket),
      ...withChildren(ticket),
    })),
    queued: rowsIn('Queued').map(({ ticket }) => ({
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
  if (!isFiltering(filter)) {
    return unfiltered;
  }

  // Narrow every section by the Board filter.
  const matchesSelf = (number: number) => {
    const ticket = onBoard.get(number);
    return ticket !== undefined && ticketMatches(ticket, filter);
  };
  const keep = <Row extends CockpitTicket>(rows: Row[]): Row[] =>
    rows
      .filter(({ number }) => {
        const ticket = onBoard.get(number);
        return ticket !== undefined && keeps(ticket, filter, onBoard);
      })
      .map((row) => {
        const { children } = row;
        if (!children || matchesSelf(row.number)) {
          return row;
        }
        return {
          ...row,
          children: children.filter(({ number }) => matchesSelf(number)),
        };
      });
  const narrowed = {
    actionNeeded: keep(unfiltered.needsYou.actionNeeded),
    review: keep(unfiltered.needsYou.review),
    intake: keep(unfiltered.needsYou.intake),
  };
  return {
    ...unfiltered,
    needsYou: {
      ...narrowed,
      count:
        narrowed.actionNeeded.length +
        narrowed.review.length +
        narrowed.intake.length,
      total: unfiltered.needsYou.total,
    },
    epics: keep(unfiltered.epics),
    inFlight: keep(unfiltered.inFlight),
    yourWork: keep(unfiltered.yourWork),
    queued: keep(unfiltered.queued),
    done: keep(unfiltered.done),
  };
}
