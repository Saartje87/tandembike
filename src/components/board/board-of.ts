import { formatCost } from '../../app/lib/format-cost';
import { type BoardFilter, noBoardFilter } from '../../app/lib/paths';
import type {
  ConversationActivity,
  LiveConversation,
} from '../../conversations/conversation-activity';
import { blockerResolved } from '../../tickets/blocker-rule';
import { isPullRequestReference } from '../../tickets/external-reference-display';
import type { PaletteColor } from '../../tickets/palette';
import {
  type BoardLane,
  type InProgressSection,
  placementOf,
} from '../../tickets/ticket-lanes';
import type { Ticket } from '../../tickets/tickets';
import {
  isRowLabel,
  isTriageStateLabel,
  readyForAgent,
} from '../../tickets/triage-labels';
import { epicCost } from '../conversation-activity/epic-cost';
import { formatElapsed } from '../status-line/format-elapsed';
import { isFiltering, ticketMatches } from './board-filter';

/** What every Board row shows of its Ticket. */
export type BoardTicket = Pick<
  Ticket,
  'number' | 'title' | 'epic' | 'updatedAt'
> & {
  /** An Epic's own colour; `null` for a normal Ticket. */
  color: PaletteColor | null;
  /** Its labels the row shows, in its order: those `isRowLabel` keeps. */
  labels: string[];
  /**
   * For an Epic row outside In flight (Needs you, Queued, Done),
   * its children on this Board, how many more are elsewhere, and whether one
   * needs the User; absent for a normal Ticket.
   */
  children?: EpicChildRow[];
  childrenElsewhere?: number;
  childNeedsYou?: boolean;
};

/** An In progress Ticket: where it stands and what its run is doing. */
export type InFlightRow = BoardTicket & {
  section: InProgressSection;
  /** Its live Conversation, or `undefined` without one. */
  live: LiveConversation | undefined;
  /** The USD cost over all its Conversations. */
  cost: number;
  /** Its latest pull request reference, or `null`. */
  pullRequest: string | null;
};

/**
 * Where a child of an Epic stands, for its Epic's row: its own progress, not
 * the section it takes from its Epic's run (T1263). `queued` is Todo;
 * `started` is In progress and not built; `built` is an In progress child
 * whose acceptance criteria are all checked: finished on the Epic's branch,
 * waiting for the Epic to merge (T1144). `needs-you` is a child whose own
 * Conversation needs the User; an Epic run's attention is on the Epic's row.
 */
export type EpicChildState =
  | 'done'
  | 'built'
  | 'started'
  | 'needs-you'
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
  Pick<BoardTicket, 'children' | 'childrenElsewhere' | 'childNeedsYou'>
>;

/** A triaged Todo Ticket, in Board order, and whether it waits on a Blocker. */
export type TodoRow = BoardTicket & {
  blocked: boolean;
  /**
   * Its Blockers the Blocker rule leaves unresolved, by number: those still
   * open here, and those on another Board.
   */
  blockers: number[];
};

/** A ready-for-agent Todo Ticket, in the queue's order. */
export type QueuedRow = TodoRow;

/** A ready-for-human Todo Ticket: work handed to the User (ADR 0048). */
export type YourWorkRow = TodoRow;

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
export type NeedRow = BoardTicket & {
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
export type DoneRow = BoardTicket & {
  cost: number;
  pullRequest: string | null;
};

/** The sections whose rows a drag orders, each among its own rows. */
export type ReorderSection = 'Queued' | 'Your work' | 'Intake';

/**
 * How many rows each section of a Board shows, under the Board filter. Flow's
 * Ticket path and the Backlog's Intake count read these, so they match.
 */
export type BoardCounts = {
  /**
   * The rows of Needs you, a blocked Your work row too: Needs you shows while
   * it has any. `needsYou.count` is how many of them wait on the User.
   */
  needsYouRows: number;
  actionNeeded: number;
  review: number;
  yourWork: number;
  intake: number;
  /** The Running Epics and Tickets. */
  inFlight: number;
  queued: number;
  done: number;
};

/** A Board's Tickets as it shows them. */
export type BoardView = {
  /** What waits on the User, each group longest waiting first. */
  needsYou: {
    actionNeeded: NeedRow[];
    review: NeedRow[];
    /**
     * This Board's ready-for-human Todo Tickets, in Board order. A blocked
     * one is listed but not counted: it cannot be done yet (ADR 0048).
     */
    yourWork: YourWorkRow[];
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
   * Intake or Your work; Epics in Todo or Done are rows of Queued or Done.
   */
  epics: EpicRow[];
  /** The Running Tickets outside those Epics, in Board order. */
  inFlight: InFlightRow[];
  queued: QueuedRow[];
  done: DoneRow[];
  /** Done Tickets of all of them, Epics and archived Tickets left out. */
  progress: { done: number; total: number };
  counts: BoardCounts;
  /**
   * The Todo Tickets this Board orders, over all three sections a drag
   * orders, in Board order, whatever the Board filter. An Epic planned in
   * another Cycle, shown here for its children, is not this Board's to order.
   */
  todoOrder: number[];
  /**
   * The numbers a drag orders in each section, in the order shown: its rows
   * under the Board filter that are in `todoOrder`.
   */
  reorderScopes: Record<ReorderSection, number[]>;
};

/** What `boardOf` lays out before it counts and orders. */
type BoardSections = Omit<BoardView, 'counts' | 'todoOrder' | 'reorderScopes'>;

const byPosition = (left: Ticket, right: Ticket) =>
  left.position - right.position || left.number - right.number;

/** An Epic's colour: every Epic has one; grey only stands in should it lack it. */
const epicColorOf = (epic: Ticket): PaletteColor => epic.color ?? 'grey';

/** What every row shows of `ticket`; an archived row too. */
export const rowOf = (ticket: Ticket): BoardTicket => ({
  number: ticket.number,
  title: ticket.title,
  epic: ticket.epic,
  updatedAt: ticket.updatedAt,
  color: ticket.type === 'Epic' ? epicColorOf(ticket) : null,
  labels: ticket.labels.filter(isRowLabel),
});

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

/** How many rows of Needs you wait on the User: a blocked Your work row does not. */
const needsYouCount = ({
  actionNeeded,
  review,
  yourWork,
  intake,
}: Pick<
  BoardView['needsYou'],
  'actionNeeded' | 'review' | 'yourWork' | 'intake'
>): number =>
  actionNeeded.length +
  review.length +
  yourWork.filter(({ blocked }) => !blocked).length +
  intake.length;

const countsOf = ({
  needsYou,
  epics,
  inFlight,
  queued,
  done,
}: BoardSections) => ({
  needsYouRows:
    needsYou.actionNeeded.length +
    needsYou.review.length +
    needsYou.yourWork.length +
    needsYou.intake.length,
  actionNeeded: needsYou.actionNeeded.length,
  review: needsYou.review.length,
  yourWork: needsYou.yourWork.length,
  intake: needsYou.intake.length,
  inFlight: epics.length + inFlight.length,
  queued: queued.length,
  done: done.length,
});

/**
 * The Todo Tickets of `tickets` the Board of Cycle `cycleId` (`null` for the
 * Backlog) orders, in Board order: archived ones and an Epic planned on
 * another Board left out.
 */
const todoOrderOf = (tickets: Ticket[], cycleId: number | null) =>
  tickets
    .filter(
      (ticket) =>
        ticket.status === 'Todo' &&
        !ticket.archived &&
        (ticket.type !== 'Epic' || (ticket.cycle?.id ?? null) === cycleId),
    )
    .sort(byPosition)
    .map(({ number }) => number);

/** `view` with its counts, its Todo order and the scopes a drag orders. */
function completed(
  view: BoardSections,
  tickets: Ticket[],
  cycleId: number | null,
): BoardView {
  const todoOrder = todoOrderOf(tickets, cycleId);
  const ordered = new Set(todoOrder);
  const scope = (rows: BoardTicket[]) =>
    rows.map(({ number }) => number).filter((number) => ordered.has(number));
  return {
    ...view,
    counts: countsOf(view),
    todoOrder,
    reorderScopes: {
      Queued: scope(view.queued),
      'Your work': scope(view.needsYou.yourWork),
      Intake: scope(view.needsYou.intake),
    },
  };
}

const longestWaitingFirst = (left: NeedRow, right: NeedRow) =>
  left.since.getTime() - right.since.getTime() || left.number - right.number;

/**
 * The view of a Board's `tickets`: those of a Cycle or of the Backlog, and
 * nothing else (ADR 0025). It places each Ticket by `placementOf`, so the
 * Board and every other view agree, and reads run state and cost
 * from `activity`. An Epic's row lists only its children on this Board, and
 * counts the others as `childrenElsewhere`; its cost still covers them all.
 *
 * The Board `filter` narrows every section: a row stays when its Ticket
 * matches, and an Epic's row also when one of its children here does, then
 * listing only the matching children (all of them when the Epic matches
 * itself). `needsYou.count`, the `counts` and the lists follow the filter;
 * `needsYou.total`, the `progress` and the `todoOrder` do not.
 *
 * `cycleId` is the Board's Cycle, `null` for the Backlog's, the default: it
 * decides which Epics' places in `todoOrder` the Board orders.
 */
export function boardOf(
  tickets: Ticket[],
  activity: Pick<ConversationActivity, 'live' | 'cost'>,
  filter: BoardFilter = noBoardFilter,
  cycleId: number | null = null,
): BoardView {
  return completed(sectionsOf(tickets, activity, filter), tickets, cycleId);
}

/** The sections of `boardOf`, before it counts and orders them. */
function sectionsOf(
  tickets: Ticket[],
  activity: Pick<ConversationActivity, 'live' | 'cost'>,
  filter: BoardFilter,
): BoardSections {
  const onBoard = new Map(tickets.map((ticket) => [ticket.number, ticket]));
  const shown = tickets.filter(isShown);
  // Every Epic is placed by its lane, like a Ticket.
  const allEpics = tickets
    .filter((ticket) => ticket.type === 'Epic' && !ticket.archived)
    .map((epic) => ({
      epic,
      live: activity.live[epic.number],
      ...placementOf(epic, activity.live),
    }))
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
    placedByEpic,
  }: {
    ticket: Ticket;
    placedByEpic: boolean;
  }) =>
    placedByEpic &&
    ticket.epic !== null &&
    runningEpics.has(ticket.epic.number);
  const placed = shown
    .map((ticket) => ({
      ticket,
      live: activity.live[ticket.number],
      ...placementOf(ticket, activity.live),
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
    // Only the child's own Conversation needing the User outranks its
    // progress; a section it takes from its Epic's run never does (T1263).
    if (entry.live !== undefined && entry.section === 'Action needed') {
      return 'needs-you';
    }
    if (isBuilt(entry.ticket)) {
      return 'built';
    }
    if (entry.lane === 'In progress') {
      return 'started';
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
  /** A triaged Todo row: its Epic's children, and its open Blockers. */
  const todoRow = (ticket: Ticket): TodoRow => ({
    ...rowOf(ticket),
    ...withChildren(ticket),
    blocked: ticket.blocked,
    blockers: ticket.blocked
      ? ticket.blockedBy.filter((number) => {
          // A Blocker off this Board counts as unresolved.
          const blocker = onBoard.get(number);
          return !blocker || !blockerResolved(blocker, ticket);
        })
      : [],
  });
  const needsYouRow = (row: NeedRow): NeedRow => {
    const epic = allEpics.find(({ epic }) => epic.number === row.number);
    return epic ? { ...row, ...childrenOf(epic.epic) } : row;
  };

  const needsYouRows = {
    actionNeeded: actionNeeded.map(needsYouRow),
    review: review.map(needsYouRow),
    yourWork: rowsIn('Your work').map(({ ticket }) => todoRow(ticket)),
    intake,
  };
  const unfiltered: BoardSections = {
    needsYou: {
      ...needsYouRows,
      count: needsYouCount(needsYouRows),
      total: needsYouCount(needsYouRows),
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
    queued: rowsIn('Queued').map(({ ticket }) => todoRow(ticket)),
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
  const keep = <Row extends BoardTicket>(rows: Row[]): Row[] =>
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
    yourWork: keep(unfiltered.needsYou.yourWork),
    intake: keep(unfiltered.needsYou.intake),
  };
  return {
    ...unfiltered,
    needsYou: {
      ...narrowed,
      count: needsYouCount(narrowed),
      total: unfiltered.needsYou.total,
    },
    epics: keep(unfiltered.epics),
    inFlight: keep(unfiltered.inFlight),
    queued: keep(unfiltered.queued),
    done: keep(unfiltered.done),
  };
}

// The rows' second lines: pure functions of a row and the time, outside
// `boardOf`, so the Board does not derive again on every clock tick.

/** A pull request's number from its GitHub URL, such as `PR #87`. */
export const pullRequestLabel = (url: string) =>
  `PR #${new URL(url).pathname.split('/')[4]}`;

/** A row's second line: its parts that are there, joined by a dot. */
const lineOf = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' · ');

/** How long ago `date` was at `now`. */
const ageAt = (date: Date, now: number) => formatElapsed(now - date.getTime());

/**
 * What a Needs you row's kind is called, and what it waits on when it has no
 * live Conversation whose line says so.
 */
const needText: Record<NeedKind, { label: string; parked?: string }> = {
  waiting: { label: 'Waiting' },
  idle: { label: 'Idle' },
  failed: { label: 'Failed' },
  interrupted: { label: 'Interrupted' },
  stalled: { label: 'Stalled', parked: 'no Claim and no PR' },
  review: { label: 'Review', parked: 'PR open' },
  intake: { label: 'Intake', parked: 'to triage' },
};

/** A Needs you row's second line: what it waits on, and for how long. */
export function needLine(row: NeedRow, now: number): string {
  const { label, parked } = needText[row.kind];
  return lineOf(label, row.live?.line ?? parked, ageAt(row.since, now));
}

/** What a blocked Todo row waits on, by its Blockers when it knows them. */
export const blockedByOf = (row: TodoRow): string =>
  row.blockers.length > 0
    ? `blocked by ${row.blockers.map((number) => `T${number}`).join(', ')}`
    : 'blocked';

/** A queued row's second line: its place, `index` from 0, and what blocks it. */
export function queuedLine(row: QueuedRow, index: number): string {
  return lineOf(`Queued #${index + 1}`, row.blocked && blockedByOf(row));
}

/** A Your work row's second line: how long it has been handed over, and what blocks it. */
export function yourWorkLine(row: YourWorkRow, now: number): string {
  return lineOf(
    `ready-for-human · for ${ageAt(row.updatedAt, now)}`,
    row.blocked && blockedByOf(row),
  );
}

/**
 * An In flight row's second line: its live line and run time, or, for a
 * claimed Ticket with no live run (such as one worked in a terminal), that.
 */
export function inFlightLine(row: InFlightRow, now: number): string {
  // A Terminal run shows elapsed time only, even when a UI run spent before
  // the hand-off (ADR 0039).
  const cost =
    !row.live?.terminal && row.cost > 0 && formatCost(row.cost, 'usd');
  return row.live
    ? lineOf(
        row.live.line,
        formatElapsed(now - new Date(row.live.since).getTime()),
        cost,
      )
    : lineOf('Claimed, no live run', cost);
}

/** A Done row's second line: since when, its pull request and its cost. */
export function doneLine(row: DoneRow, now: number): string {
  return lineOf(
    `Done ${ageAt(row.updatedAt, now)} ago`,
    row.pullRequest && pullRequestLabel(row.pullRequest),
    row.cost > 0 && formatCost(row.cost, 'usd'),
  );
}

/** An archived row's second line: what it is, and since when. */
export function archivedLine(
  ticket: Pick<Ticket, 'type' | 'updatedAt'>,
  now: number,
): string {
  return `Archived · ${ticket.type === 'Epic' ? 'Epic' : 'Ticket'} · ${ageAt(ticket.updatedAt, now)} ago`;
}
