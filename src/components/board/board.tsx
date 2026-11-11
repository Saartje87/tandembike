'use client';

import {
  Alert,
  Box,
  Button,
  Checkbox,
  Heading,
  IconButton,
  Inline,
  Link,
  Progress,
  Stack,
  Tag,
  Text,
} from '@blockle/blocks';
import {
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from '@dnd-kit/dom';
import {
  type BeforeDragStartEvent,
  DragDropProvider as DndProvider,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import {
  type FC,
  type MouseEvent,
  type ReactNode,
  type Ref,
  startTransition,
  useEffect,
  useId,
  useOptimistic,
} from 'react';

import { callAction } from '../../app/lib/call-action';
import { formatCost } from '../../app/lib/format-cost';
import { modeColors } from '../../app/lib/mode-colors';
import {
  type BoardFilter,
  type BoardSection,
  boardPathOf,
  projectFlowPath,
  ticketOnBoardPath,
} from '../../app/lib/paths';
import { reorderTickets } from '../../app/tickets/actions';
import type { Cycle } from '../../tickets/cycles';
import type { BatchFailure } from '../../tickets/errors';
import type { InProgressSection } from '../../tickets/ticket-lanes';
import type { Ticket } from '../../tickets/tickets';
import { readyForAgent } from '../../tickets/triage-labels';
import { AddToEpicMenu } from '../add-to-epic-menu/add-to-epic-menu';
import { AppLink } from '../app-link/app-link';
import {
  AutopilotBar,
  type AutopilotBarProps,
} from '../autopilot-bar/autopilot-bar';
import { BoardFilterBar } from '../board-filter-bar/board-filter-bar';
import {
  useLiveConversations,
  useTicketCosts,
} from '../conversation-activity/conversation-activity';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import { CopyTicketNumber } from '../copy-ticket-number/copy-ticket-number';
import { Icon, type IconName } from '../icon/icon';
import { LabelList } from '../label-list/label-list';
import { useTicketChanged } from '../live-updates/live-updates';
import { MoveToCycleMenu } from '../move-to-cycle-menu/move-to-cycle-menu';
import { NewTicketInline } from '../new-ticket-inline/new-ticket-inline';
import { tinted } from '../palette/palette.css';
import { SelectionBar } from '../selection-bar/selection-bar';
import { formatElapsed } from '../status-line/format-elapsed';
import { useNow } from '../status-line/use-now';
import * as styles from './board.css';
import {
  filteredSelectionDrop,
  isFiltering,
  mergeLaneOrder,
  ticketMatches,
} from './board-filter';
import {
  type BoardTicket,
  boardOf,
  type EpicChildState,
  type EpicRow,
  type InFlightRow,
  type NeedKind,
  type NeedRow,
  type QueuedRow,
  rowOf,
  type TodoRow,
} from './board-of';
import { isSelectClick, type SelectMode, selectModeOf } from './select-click';
import { useBoardFilter } from './use-board-filter';
import { type SelectionList, useSelection } from './use-selection';

export type BoardProps = {
  projectId: number;
  /** The Cycle shown, or `null` for the Backlog. */
  cycle: Pick<Cycle, 'id' | 'title'> | null;
  /** The Cycle's Tickets, as its Board gets them. */
  tickets: Ticket[];
  /**
   * The Project's Start runs working now, and how many it allows at once;
   * given on the Active Cycle's Board only.
   */
  runSlots?: { used: number; cap: number };
  /**
   * The Project's Autopilot switch, Spend ceiling and the Cycle's Autopilot
   * spend; given on the Active Cycle's Board only.
   */
  autopilot?: Omit<AutopilotBarProps, 'projectId'>;
  /**
   * Whether this is a planning Board, a Prepared Cycle's or the Backlog's:
   * Queued starts open, and an empty section is hidden.
   */
  planning?: boolean;
  /** The Board's archived Tickets, listed last. Defaults to none. */
  archived?: Ticket[];
  /** The Project's Cycles, for the selection bar's Move to Cycle. Defaults to none. */
  cycles?: Cycle[];
  /** The Project's live Epics, for the selection bar's Add to Epic. Defaults to none. */
  epics?: Pick<Ticket, 'number' | 'title'>[];
  /** The Board filter in the URL as the Board loads. */
  filter?: BoardFilter;
  /** The numbers of Tickets with a pending triage proposal. Defaults to none. */
  proposedTriage?: number[];
};

const sectionIntent = {
  Running: 'primary',
  'Action needed': 'warning',
  Review: 'info',
} as const satisfies Record<InProgressSection, string>;

/** A pull request's number from its GitHub URL, such as `#87`. */
const pullRequestLabel = (url: string) =>
  `PR #${new URL(url).pathname.split('/')[4]}`;

type PullRequestLinkProps = { url: string };

/** A pull request as a link to it, in small text. */
const PullRequestLink: FC<PullRequestLinkProps> = ({ url }) => (
  <Text fontSize="small">
    <Link href={url} target="_blank" rel="noreferrer">
      {pullRequestLabel(url)}
    </Link>
  </Text>
);

type ConversationBellProps = {
  /** The Ticket whose run waits, for the button's name. */
  number: number;
  conversationId: number;
};

/**
 * Opens the Conversation of a run that waits on the User, so the User reads
 * what it did and asks before answering. Nothing is answered from the list.
 */
const ConversationBell: FC<ConversationBellProps> = ({
  number,
  conversationId,
}) => {
  const dialog = useConversationDialog();
  return (
    // Primary, not warning: IconButton has no warning intent (T1109).
    <IconButton
      variant="outline"
      intent="primary"
      shape="circle"
      size="small"
      label={`Open the Conversation of T${number}`}
      onClick={() => dialog.open(conversationId)}
    >
      <Icon name="bell-alert" size="small" />
    </IconButton>
  );
};

/**
 * How a Needs you row shows its kind: its icon, its label, and what it waits
 * on when it has no live Conversation whose line says so.
 */
const needDisplay: Record<
  NeedKind,
  { icon: IconName; label: string; parked?: string }
> = {
  waiting: { icon: 'chat-bubble-left-ellipsis', label: 'Waiting' },
  idle: { icon: 'hand-raised', label: 'Idle' },
  failed: { icon: 'exclamation-circle', label: 'Failed' },
  interrupted: { icon: 'pause-circle', label: 'Interrupted' },
  stalled: {
    icon: 'exclamation-triangle',
    label: 'Stalled',
    parked: 'no Claim and no PR',
  },
  review: { icon: 'check-circle', label: 'Review', parked: 'PR open' },
  intake: { icon: 'inbox', label: 'Intake', parked: 'to triage' },
};

/** A row's second line: its parts that are there, joined by a dot. */
const lineOf = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' · ');

/** A Needs you row's second line: what it waits on, and for how long. */
function needLine(row: NeedRow, waited: string): string {
  const { label, parked } = needDisplay[row.kind];
  return lineOf(label, row.live?.line ?? parked, waited);
}

/** What a blocked Todo row waits on, by its Blockers when it knows them. */
const blockedByOf = (row: TodoRow): string =>
  row.blockers.length > 0
    ? `blocked by ${row.blockers.map((number) => `T${number}`).join(', ')}`
    : 'blocked';

/** A queued row's second line: its place, and what blocks it. */
function queuedLine(row: QueuedRow, index: number): string {
  return lineOf(`Queued #${index + 1}`, row.blocked && blockedByOf(row));
}

const countPrefix = /^\(\d+\) /;

/**
 * Puts `count` in front of the browser tab's title, as `(3) …`, and takes
 * it off at zero and on unmount, so a background tab shows what waits on the
 * User. Next writes the page's metadata title again on navigation, such as
 * opening a drawer, so it watches the head and puts the count back.
 */
const useCountInTitle = (count: number) => {
  useEffect(() => {
    const apply = () => {
      const title = document.title.replace(countPrefix, '');
      const wanted = count > 0 ? `(${count}) ${title}` : title;
      if (document.title !== wanted) {
        document.title = wanted;
      }
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    return () => {
      observer.disconnect();
      document.title = document.title.replace(countPrefix, '');
    };
  }, [count]);
};

type TicketRowProps = {
  ticket: BoardTicket;
  href: string;
  icon: IconName;
  /** The second line: what the Ticket is doing or where it stands. */
  line: string;
  /** Greyed out, for work that does not need the User now. */
  muted?: boolean;
  /** Shown beside the title, such as an Epic's children bar. */
  beside?: ReactNode;
  end?: ReactNode;
  /** Under the row, opened from it: an Epic's children. */
  details?: ReactNode;
  /** Set on a row that can be dragged, which then takes focus for the keyboard. */
  rowRef?: Ref<HTMLLIElement>;
  /** Makes the row selectable: whether it is, and how a select gesture lands. */
  selection?: { selected: boolean; onSelect: (mode: SelectMode) => void };
};

/**
 * One Ticket as a row: the same shape in every list of the Board, edged in
 * its Epic's colour, or its own for an Epic. With `details`, the row opens
 * and closes on itself to show them. It is highlighted for a moment after
 * the Ticket changes (see `LiveUpdates`).
 */
const TicketRow: FC<TicketRowProps> = ({
  ticket,
  href,
  icon,
  line,
  muted = false,
  beside,
  end,
  details,
  rowRef,
  selection,
}) => {
  const color = ticket.epic?.color ?? ticket.color;
  const changed = useTicketChanged(ticket.number);
  const mutedBackground = muted ? modeColors.sunken : modeColors.raised;
  const background = changed ? modeColors.primarySubtle : mutedBackground;
  // Runs before the title link's own click, so it neither navigates nor opens a tab.
  const selectByClick = (event: MouseEvent<HTMLLIElement>) => {
    if (
      !selection ||
      !isSelectClick(event) ||
      (event.target instanceof HTMLInputElement &&
        event.target.type === 'checkbox')
    ) {
      return;
    }
    event.preventDefault();
    selection.onSelect(selectModeOf(event));
  };
  const content = (
    <Inline gap={3} alignY="center" alignX="between" flexWrap="nowrap">
      <Inline gap={2} alignY="center" minInlineSize={0} flex={1}>
        {selection && (
          <Checkbox
            name={`select-${ticket.number}`}
            aria-label={`Select T${ticket.number} ${ticket.title}`}
            checked={selection.selected}
            onChange={(event) =>
              // A checkbox's change comes from its click, with its keys.
              selection.onSelect(selectModeOf(event.nativeEvent))
            }
          />
        )}
        <Icon
          name={icon}
          size="small"
          color={muted ? modeColors.textMuted : undefined}
        />
        <CopyTicketNumber number={ticket.number} quiet />
        <Stack gap={0} minInlineSize={0} flex={1}>
          <Inline gap={2} alignY="center">
            <Text
              truncate
              fontWeight={muted ? 'normal' : 'medium'}
              color={muted ? 'muted' : undefined}
            >
              <AppLink href={href} intent="inherit">
                {ticket.title}
              </AppLink>
            </Text>
            {ticket.epic && (
              <Tag className={tinted[ticket.epic.color]}>
                T{ticket.epic.number} {ticket.epic.title}
              </Tag>
            )}
            {beside}
          </Inline>
          <Text truncate fontSize="small" color="muted">
            {line}
          </Text>
        </Stack>
      </Inline>
      <Inline gap={2} alignY="center" flexWrap="nowrap" flexShrink={0}>
        <LabelList labels={ticket.labels} max={2} />
        {end}
      </Inline>
    </Inline>
  );
  return (
    <Box
      asChild
      paddingBlock={2}
      paddingInline={3}
      borderRadius={2}
      backgroundColor={background}
      boxShadow={muted ? undefined : 1}
      transition="slow"
      className={color ? styles.epicEdge[color] : styles.edge}
    >
      {/* Keyboard users select with the checkbox. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: a modifier-click shortcut */}
      <li
        ref={rowRef}
        // dnd-kit makes a row it drags a button unless it has a role; it
        // stays a list item, with the drag in its role description.
        role={rowRef ? 'listitem' : undefined}
        // Focusable from the first render when it can be dragged, so Space
        // picks it up; dnd-kit would add this only on a later frame.
        tabIndex={rowRef ? 0 : undefined}
        data-changed={changed ? '' : undefined}
        onClick={selectByClick}
      >
        {details ? (
          <details>
            <Box asChild className={styles.summary}>
              <summary>{content}</summary>
            </Box>
            {details}
          </details>
        ) : (
          content
        )}
      </li>
    </Box>
  );
};

/** The sections whose rows a drag orders, each among its own rows. */
type ReorderSection = 'Queued' | 'Your work' | 'Intake';

type Sortable = { section: ReorderSection; index: number };

const SortableTicketRow: FC<TicketRowProps & Sortable> = ({
  section,
  index,
  ...row
}) => {
  const { ref } = useSortable({
    id: row.ticket.number,
    index,
    group: section,
    data: { section },
    collisionPriority: 3,
  });
  return <TicketRow {...row} rowRef={ref} />;
};

type DraggableTicketRowProps = TicketRowProps & {
  /** Where a drag moves the row; left out, the row cannot be dragged. */
  sortable?: Sortable;
};

/** A row that a drag moves within its section, by pointer or keyboard, if it may. */
const DraggableTicketRow: FC<DraggableTicketRowProps> = ({
  sortable,
  ...row
}) =>
  sortable ? (
    <SortableTicketRow {...row} {...sortable} />
  ) : (
    <TicketRow {...row} />
  );

/**
 * A row is dragged from anywhere on it. A mouse drag starts once the pointer
 * moves 5px, so a click still opens it; a touch drag after a 250ms press, so
 * a swipe still scrolls. Space picks up the focused row by keyboard.
 */
const sensors = [
  PointerSensor.configure({
    activationConstraints: (event) =>
      event.pointerType === 'touch'
        ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 })]
        : [new PointerActivationConstraints.Distance({ value: 5 })],
    preventActivation: (event) =>
      event.target instanceof Element &&
      event.target.closest('input, button, select, textarea') !== null,
  }),
  KeyboardSensor,
];

const dragSectionOf = (
  item: { data: Record<string, unknown> } | null | undefined,
) => item?.data.section;

const childStateLabel: Record<EpicChildState, string> = {
  done: 'done',
  built: 'built',
  started: 'started',
  'needs-you': 'needs you',
  queued: 'queued',
};

type PipProps = { state: EpicChildState; title?: string };

/** One child's mark in an Epic's children bar, coloured by its state. */
const Pip: FC<PipProps> = ({ state, title }) => (
  <span title={title} className={`${styles.pip} ${styles.pipState[state]}`} />
);

type ChildrenBarProps = { row: Pick<EpicRow, 'children'> };

/**
 * An Epic's children on this Board as one mark each, coloured by where it
 * stands; nothing without any.
 */
const ChildrenBar: FC<ChildrenBarProps> = ({ row }) => {
  if (row.children.length === 0) {
    return null;
  }
  // A built child counts as finished: it waits only for its Epic to merge (T1144).
  const done = row.children.filter(
    ({ state }) => state === 'done' || state === 'built',
  ).length;
  return (
    <Inline
      gap={1}
      alignY="center"
      flexWrap="nowrap"
      role="img"
      aria-label={`${done} of ${row.children.length} children done or built`}
    >
      {row.children.map((child) => (
        <Pip
          key={child.number}
          state={child.state}
          title={`T${child.number} ${child.title}: ${childStateLabel[child.state]}`}
        />
      ))}
      <Text fontSize="xsmall" color="muted">
        {done}/{row.children.length}
      </Text>
    </Inline>
  );
};

/** Whose Board it is: a Cycle's or the Backlog's. */
type BoardKind = 'Cycle' | 'Backlog';

const boardName: Record<BoardKind, string> = {
  Cycle: 'this Cycle',
  Backlog: 'the Backlog',
};

type EpicChildListProps = {
  row: Pick<EpicRow, 'children' | 'childrenElsewhere'>;
  /** Whose Board it is, to say where its children are not. */
  board: BoardKind;
  /** Where a child opens in its drawer over this Board. */
  hrefOf: (number: number) => string;
  /** Said in place of "No children yet", such as for an Epic still to split. */
  emptyText?: string;
};

/** What an Intake row says of a ready-for-agent Epic without children (ADR 0027). */
const notSplitText =
  'Ready for an Agent once split: no children yet. Triage it to split it.';

/** What an Epic's row says when none of its children are on this Board. */
const noChildrenText = (
  childrenElsewhere: number,
  board: BoardKind,
  emptyText = 'No children yet',
) => {
  if (childrenElsewhere === 0) {
    return emptyText;
  }
  return `No children in ${boardName[board]} (${childrenElsewhere} elsewhere)`;
};

/**
 * An opened Epic row: each child on this Board with where it stands, its
 * title opening it over this Board, or where they are when none is.
 */
const EpicChildList: FC<EpicChildListProps> = ({
  row,
  board,
  hrefOf,
  emptyText,
}) =>
  row.children.length === 0 ? (
    <Box paddingBlockStart={2} paddingInlineStart={6}>
      <Text fontSize="small" color="muted">
        {noChildrenText(row.childrenElsewhere, board, emptyText)}
      </Text>
    </Box>
  ) : (
    <Stack
      gap={1}
      paddingBlockStart={2}
      paddingInlineStart={6}
      listStyle="none"
      role="list"
      asChild
    >
      <ul>
        {row.children.map((child) => (
          <li key={child.number}>
            <Inline gap={2} alignY="center">
              <Pip state={child.state} />
              <Text fontSize="small" fontFamily="mono" color="muted">
                T{child.number}
              </Text>
              <Text fontSize="small">
                <AppLink
                  href={hrefOf(child.number)}
                  scroll={false}
                  intent="inherit"
                >
                  {child.title}
                </AppLink>
              </Text>
              <Text fontSize="small" color="muted">
                {childStateLabel[child.state]}
              </Text>
            </Inline>
          </li>
        ))}
      </ul>
    </Stack>
  );

/**
 * What an Epic's row adds to a Ticket's row: its children bar beside the
 * title, and its children listed when opened. Nothing for a normal Ticket.
 */
const epicParts = (
  row: BoardTicket,
  board: BoardKind,
  hrefOf: (number: number) => string,
  emptyText?: string,
) =>
  row.children
    ? {
        beside: <ChildrenBar row={{ children: row.children }} />,
        details: (
          <EpicChildList
            row={{
              children: row.children,
              childrenElsewhere: row.childrenElsewhere ?? 0,
            }}
            board={board}
            hrefOf={hrefOf}
            emptyText={emptyText}
          />
        ),
      }
    : {};

/**
 * What each Board section holds and how work gets there, shown while it is
 * empty, so an empty Board teaches the next step (ADR 0044).
 */
export const emptyText = {
  needsYou:
    'Nothing needs you: runs that ask or stop, pull requests to review, work handed to you and Tickets to triage show here.',
  actionNeeded:
    'Action needed is empty: a run that asks, stops or fails waits here for you.',
  review:
    'Review is empty: a Ticket comes here when its run opens a pull request.',
  intake: 'Intake is empty: a new Ticket waits here until it is triaged.',
  inFlight:
    'Nothing in flight: Autopilot or you start a run on Queued work, and it shows here while it works.',
  yourWork:
    'Your work is empty: triage a Ticket as ready-for-human to hand it to you.',
  queued: 'Queued is empty: triage a Ticket as ready-for-agent to queue it.',
  done: 'Nothing Done yet: a Ticket lands here once its pull request is merged or it is finished.',
  archived: 'Nothing archived: an archived Ticket is listed here.',
};

type RowListProps = {
  title: string;
  /** What belongs here and how work gets here, shown while it is empty. */
  empty: string;
  /** Its anchor, which Flow links to (`boardSectionPath`). */
  id: BoardSection;
  count: number;
  /** Open at first; the User opens and closes it on its heading. */
  open?: boolean;
  children: ReactNode;
};

/** A titled list of rows that opens and closes on its heading. */
const RowList: FC<RowListProps> = ({
  title,
  empty,
  id,
  count,
  open = false,
  children,
}) =>
  count === 0 ? (
    <Stack gap={1} asChild>
      <section aria-label={title} id={id}>
        <Inline gap={2} alignY="center">
          <Text fontSize="small" fontWeight="strong" color="muted">
            {title}
          </Text>
          <Tag>0</Tag>
        </Inline>
        <Text tag="p" fontSize="small" color="muted">
          {empty}
        </Text>
      </section>
    </Stack>
  ) : (
    <Box asChild>
      <section aria-label={title} id={id}>
        <details open={open}>
          <Box asChild className={styles.summary} paddingBlockEnd={1}>
            <summary>
              <Inline gap={2} alignY="center">
                <span className={styles.chevron}>
                  <Icon name="chevron-right" size="small" />
                </span>
                <Text fontSize="small" fontWeight="strong" color="muted">
                  {title}
                </Text>
                <Tag>{count}</Tag>
              </Inline>
            </summary>
          </Box>
          <Stack gap={1} listStyle="none" role="list" asChild>
            <ul>{children}</ul>
          </Stack>
        </details>
      </section>
    </Box>
  );

type NotMovedProps = { refusals: BatchFailure[] };

/** Why each Ticket a move to a Cycle left out was refused. */
const NotMoved: FC<NotMovedProps> = ({ refusals }) => {
  const headingId = useId();
  return (
    <Alert intent="warning">
      <Stack gap={1}>
        <Text id={headingId}>Not moved</Text>
        <Stack
          gap={1}
          aria-labelledby={headingId}
          listStyle="none"
          role="list"
          asChild
        >
          <ul>
            {refusals.map(({ number, error }) => (
              <li key={number}>{error}</li>
            ))}
          </ul>
        </Stack>
      </Stack>
    </Alert>
  );
};

/**
 * An In flight row's second line: its live line and run time, or, for a
 * claimed Ticket with no live run (such as one worked in a terminal), that.
 */
function inFlightLine(row: InFlightRow, now: number): string {
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

/**
 * A Project's Board: a Cycle's or the Backlog's Tickets in one column, by
 * what needs the User first. The header shows the Cycle's progress and the Start runs
 * working; Needs you shows what waits on the User on this Board (Action
 * needed, Review, Your work, then Intake), in groups that start open,
 * Action needed and Review longest waiting first, Your work and Intake in
 * Board order (ADR 0048); In flight shows each Running Ticket with what
 * its run is doing; Queued and Done stay closed until opened on the Active
 * Cycle's Board.
 * Its lists offer no actions: every row's title opens its Ticket in a
 * drawer over the Board. The browser tab's title carries the Needs you
 * count. It follows live Conversations.
 *
 * Rows can be selected with their checkbox, Cmd-click or Ctrl-click, or a
 * Shift-click range within one list; a bar then moves the selection to
 * another Cycle or the Backlog, adds it to an Epic, or archives it. The
 * Tickets an action refuses stay selected, with the reason. Epic rows
 * cannot be selected.
 */
export const Board: FC<BoardProps> = ({
  projectId,
  cycle,
  tickets,
  runSlots,
  autopilot,
  planning = false,
  archived = [],
  cycles = [],
  epics = [],
  filter: initialFilter,
  proposedTriage = [],
}) => {
  const live = useLiveConversations();
  const cost = useTicketCosts();
  const now = useNow();
  const [shownTickets, showOrder] = useOptimistic(
    tickets,
    (current, order: number[]) =>
      current.map((ticket) =>
        order.includes(ticket.number)
          ? { ...ticket, position: order.indexOf(ticket.number) }
          : ticket,
      ),
  );
  const cycleId = cycle?.id ?? null;
  const board: BoardKind = cycle ? 'Cycle' : 'Backlog';
  const boardPath = boardPathOf(projectId, cycleId);
  const [filter, changeFilter] = useBoardFilter(boardPath, initialFilter);
  // The Board filter narrows every section and its counts; only the tab and
  // the browser title keep the full Needs you count.
  const view = {
    ...boardOf(shownTickets, { live, cost }, filter),
    archived: isFiltering(filter)
      ? archived.filter((ticket) => ticketMatches(ticket, filter))
      : archived,
  };
  const filterLabels = [
    ...new Set([...tickets, filter].flatMap(({ labels }) => labels)),
  ].sort();
  const hrefOf = (number: number) =>
    ticketOnBoardPath(boardPath, number, filter);
  const age = (date: Date) => formatElapsed(now - date.getTime());
  const { done, total } = view.progress;
  const hideEmpty = (count: number) => planning && count === 0;
  const { needsYou } = view;
  // Needs you shows while it has rows, though a blocked one is not counted.
  const needsYouRows =
    needsYou.actionNeeded.length +
    needsYou.review.length +
    needsYou.yourWork.length +
    needsYou.intake.length;
  const inFlightCount = view.epics.length + view.inFlight.length;
  useCountInTitle(needsYou.total);

  /** The Todo Tickets this Cycle orders, over all three sections, in order. */
  const todoLane = shownTickets
    .filter(
      (ticket) =>
        ticket.status === 'Todo' &&
        !ticket.archived &&
        (ticket.type !== 'Epic' || (ticket.cycle?.id ?? null) === cycleId),
    )
    .sort(
      (left, right) =>
        left.position - right.position || left.number - right.number,
    )
    .map(({ number }) => number);
  /** The rows of a section that a drag orders, in the order shown. */
  const sectionNumbers: Record<ReorderSection, number[]> = {
    Queued: view.queued.map(({ number }) => number),
    'Your work': needsYou.yourWork.map(({ number }) => number),
    Intake: needsYou.intake.map(({ number }) => number),
  };
  // An Epic of another Cycle shown here is not ordered by this Cycle.
  for (const section of Object.keys(sectionNumbers) as ReorderSection[]) {
    sectionNumbers[section] = sectionNumbers[section].filter((number) =>
      todoLane.includes(number),
    );
  }

  const sortableIn = (
    section: ReorderSection,
    number: number,
  ): Sortable | undefined => {
    const index = sectionNumbers[section].indexOf(number);
    return index < 0 ? undefined : { section, index };
  };

  /**
   * What a drag of row `source` in `section` carries: the selection it is
   * part of, in the order shown, else itself. Nothing when that selection
   * spans sections, or holds a row a drag cannot order.
   */
  const carriedBy = (source: number, section: ReorderSection) => {
    if (selection.length < 2 || !selection.includes(source)) {
      return [source];
    }
    const numbers = sectionNumbers[section];
    return selection.every((number) => numbers.includes(number))
      ? numbers.filter((number) => selection.includes(number))
      : undefined;
  };

  const startDrag = (event: BeforeDragStartEvent) => {
    const { source } = event.operation;
    if (
      isSortable(source) &&
      !carriedBy(Number(source.id), dragSectionOf(source) as ReorderSection)
    ) {
      event.preventDefault();
    }
  };

  const followDrag = (event: DragOverEvent) => {
    const { source, target } = event.operation;
    // dnd-kit would move the row's element into the other section's list,
    // which React then fails to remove from its own list on the drop.
    if (target && dragSectionOf(target) !== dragSectionOf(source)) {
      event.preventDefault();
    }
  };

  const saveOrder = (ticketNumbers: number[]) => {
    setError(undefined);
    startTransition(async () => {
      showOrder(ticketNumbers);
      const result = await callAction(
        () =>
          reorderTickets({ projectId, status: 'Todo', cycleId, ticketNumbers }),
        'The order could not be saved. Try again.',
      );
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  const finishDrag = (event: DragEndEvent) => {
    const { source, target } = event.operation;
    if (event.canceled || !isSortable(source)) {
      return;
    }
    const section = dragSectionOf(source) as ReorderSection;
    // A drop in another section changes nothing.
    if (dragSectionOf(target) !== section) {
      return;
    }
    const numbers = sectionNumbers[section];
    const sourceNumber = Number(source.id);
    const carried = carriedBy(sourceNumber, section);
    const from = numbers.indexOf(sourceNumber);
    // Over its own slot, the row is where dnd-kit's sorting moved it; over
    // another row, it takes that row's place.
    const to =
      target?.id === source.id
        ? source.index
        : numbers.indexOf(Number(target?.id));
    if (!carried || from < 0 || to < 0 || from === to) {
      return;
    }
    if (carried.length > 1) {
      const { laneOrder } = filteredSelectionDrop(
        todoLane,
        numbers,
        carried,
        sourceNumber,
        numbers[to],
      );
      if (laneOrder.some((number, index) => number !== todoLane[index])) {
        saveOrder(laneOrder);
      }
      return;
    }
    const moved = [...numbers];
    moved.splice(from, 1);
    moved.splice(to, 0, sourceNumber);
    // The Todo Tickets of the other sections keep their places around it.
    saveOrder(mergeLaneOrder(todoLane, moved, [sourceNumber]));
  };

  // The rows that can be selected, by list, in the order shown. An Epic's row
  // cannot be selected.
  const numbersOf = (rows: BoardTicket[]) =>
    rows.filter(({ children }) => !children).map(({ number }) => number);
  const lists: Record<SelectionList, number[]> = {
    actionNeeded: numbersOf(needsYou.actionNeeded),
    review: numbersOf(needsYou.review),
    intake: numbersOf(needsYou.intake),
    inFlight: numbersOf(view.inFlight),
    yourWork: numbersOf(needsYou.yourWork),
    queued: numbersOf(view.queued),
    done: numbersOf(view.done),
  };
  const {
    selection,
    refusals,
    error,
    setError,
    changing,
    clear: clearSelection,
    selectable,
    moveToCycle: moveSelectionToCycle,
    addToEpic: addSelectionToEpic,
    archive: archiveSelection,
  } = useSelection(lists, projectId);
  const needRows = (rows: NeedRow[], list: SelectionList) =>
    rows.map((row) => (
      <DraggableTicketRow
        key={row.number}
        sortable={sortableIn('Intake', row.number)}
        ticket={row}
        href={hrefOf(row.number)}
        icon={needDisplay[row.kind].icon}
        line={needLine(row, age(row.since))}
        {...epicParts(
          row,
          board,
          hrefOf,
          // Only an Epic without children is in Intake with ready-for-agent.
          row.kind === 'intake' && row.triageLabel === readyForAgent
            ? notSplitText
            : undefined,
        )}
        selection={row.children ? undefined : selectable(row.number, list)}
        end={
          <Inline gap={2} alignY="center" flexWrap="nowrap">
            {proposedTriage.includes(row.number) && (
              <Tag intent="info">Triage proposed</Tag>
            )}
            {row.kind === 'intake' && (
              <Tag>{row.triageLabel ?? 'no triage label'}</Tag>
            )}
            {row.pullRequest && <PullRequestLink url={row.pullRequest} />}
            {row.live && (
              <ConversationBell
                number={row.number}
                conversationId={row.live.conversationId}
              />
            )}
          </Inline>
        }
      />
    ));

  return (
    <DndProvider
      sensors={sensors}
      onBeforeDragStart={startDrag}
      onDragOver={followDrag}
      onDragEnd={finishDrag}
    >
      <Stack gap={6}>
        {error && <Alert intent="danger">{error}</Alert>}
        <Inline gap={2} alignX="end">
          <Text fontSize="small">
            <AppLink href={projectFlowPath(projectId)}>
              How this Project runs
            </AppLink>
          </Text>
        </Inline>
        <NewTicketInline
          projectId={projectId}
          {...(cycleId === null ? {} : { cycleId })}
        />
        <BoardFilterBar
          filter={filter}
          labels={filterLabels}
          onChange={changeFilter}
        />
        {cycle && (
          <Stack gap={2}>
            <Inline gap={3} alignY="center" alignX="between">
              <Text color="muted">
                {done}/{total} done
              </Text>
              {runSlots && (
                <Tag startSlot={<Icon name="cpu-chip" size="small" />}>
                  Runs {runSlots.used}/{runSlots.cap}
                </Tag>
              )}
            </Inline>
            {autopilot && <AutopilotBar projectId={projectId} {...autopilot} />}
            <Progress
              value={total === 0 ? 0 : Math.round((done / total) * 100)}
              aria-label="Cycle progress"
            />
          </Stack>
        )}
        {!hideEmpty(needsYouRows) && (
          <Stack gap={2} asChild>
            <section aria-label="Needs you" id="needs-you">
              <Inline gap={2} alignY="center">
                <Heading level={3}>Needs you</Heading>
                <Tag>{needsYou.count}</Tag>
              </Inline>
              {needsYouRows === 0 ? (
                <Text tag="p" color="muted">
                  {emptyText.needsYou}
                </Text>
              ) : (
                <Stack gap={3}>
                  {needsYou.actionNeeded.length > 0 && (
                    <RowList
                      title="Action needed"
                      empty={emptyText.actionNeeded}
                      id="action-needed"
                      count={needsYou.actionNeeded.length}
                      open
                    >
                      {needRows(needsYou.actionNeeded, 'actionNeeded')}
                    </RowList>
                  )}
                  {needsYou.review.length > 0 && (
                    <RowList
                      title="Review"
                      empty={emptyText.review}
                      id="review"
                      count={needsYou.review.length}
                      open
                    >
                      {needRows(needsYou.review, 'review')}
                    </RowList>
                  )}
                  {needsYou.yourWork.length > 0 && (
                    <RowList
                      title="Your work"
                      empty={emptyText.yourWork}
                      id="your-work"
                      count={needsYou.yourWork.length}
                      open
                    >
                      {needsYou.yourWork.map((row) => (
                        <DraggableTicketRow
                          key={row.number}
                          sortable={sortableIn('Your work', row.number)}
                          ticket={row}
                          href={hrefOf(row.number)}
                          icon={row.children ? 'queue-list' : 'user'}
                          {...epicParts(row, board, hrefOf)}
                          selection={
                            row.children
                              ? undefined
                              : selectable(row.number, 'yourWork')
                          }
                          line={lineOf(
                            `ready-for-human · for ${age(row.updatedAt)}`,
                            row.blocked && blockedByOf(row),
                          )}
                          end={
                            row.blocked ? (
                              <Tag intent="warning">Blocked</Tag>
                            ) : (
                              <Tag>Your work</Tag>
                            )
                          }
                        />
                      ))}
                    </RowList>
                  )}
                  {needsYou.intake.length > 0 && (
                    <RowList
                      title="Intake"
                      empty={emptyText.intake}
                      id="intake"
                      count={needsYou.intake.length}
                      open
                    >
                      {needRows(needsYou.intake, 'intake')}
                    </RowList>
                  )}
                </Stack>
              )}
            </section>
          </Stack>
        )}
        {!hideEmpty(inFlightCount) && (
          <Stack gap={2} asChild>
            <section aria-label="In flight" id="in-flight">
              <Inline gap={2} alignY="center">
                <Heading level={3}>In flight</Heading>
                <Tag>{inFlightCount}</Tag>
              </Inline>
              {inFlightCount === 0 ? (
                <Text tag="p" color="muted">
                  {emptyText.inFlight}
                </Text>
              ) : (
                <Stack gap={1} listStyle="none" role="list" asChild>
                  <ul>
                    {view.epics.map((row) => (
                      <TicketRow
                        key={row.number}
                        ticket={row}
                        href={hrefOf(row.number)}
                        icon="queue-list"
                        line={inFlightLine(row, now)}
                        beside={<ChildrenBar row={row} />}
                        end={
                          <Inline gap={2} alignY="center" flexWrap="nowrap">
                            {row.childNeedsYou && (
                              <Tag
                                intent="warning"
                                startSlot={
                                  <Icon name="arrow-up" size="small" />
                                }
                              >
                                needs you
                              </Tag>
                            )}
                            {row.pullRequest && (
                              <PullRequestLink url={row.pullRequest} />
                            )}
                            <Tag intent={sectionIntent[row.section]}>
                              {row.section}
                            </Tag>
                          </Inline>
                        }
                        details={
                          <EpicChildList
                            row={row}
                            board={board}
                            hrefOf={hrefOf}
                          />
                        }
                      />
                    ))}
                    {view.inFlight.map((row) => (
                      <TicketRow
                        key={row.number}
                        ticket={row}
                        href={hrefOf(row.number)}
                        icon="play"
                        selection={selectable(row.number, 'inFlight')}
                        line={inFlightLine(row, now)}
                        end={
                          <Inline gap={2} alignY="center" flexWrap="nowrap">
                            {row.pullRequest && (
                              <PullRequestLink url={row.pullRequest} />
                            )}
                            <Tag intent={sectionIntent[row.section]}>
                              {row.section}
                            </Tag>
                          </Inline>
                        }
                      />
                    ))}
                  </ul>
                </Stack>
              )}
            </section>
          </Stack>
        )}
        <Stack gap={2}>
          {!hideEmpty(view.queued.length) && (
            <RowList
              title="Queued"
              empty={emptyText.queued}
              id="queued"
              count={view.queued.length}
              open={planning}
            >
              {view.queued.map((row, index) => (
                <DraggableTicketRow
                  key={row.number}
                  sortable={sortableIn('Queued', row.number)}
                  muted
                  ticket={row}
                  href={hrefOf(row.number)}
                  icon={row.children ? 'queue-list' : 'clock'}
                  {...epicParts(row, board, hrefOf)}
                  selection={
                    row.children ? undefined : selectable(row.number, 'queued')
                  }
                  line={queuedLine(row, index)}
                  end={
                    row.blocked ? (
                      <Tag intent="warning">Blocked</Tag>
                    ) : index === 0 ? (
                      <Tag intent="primary">Next</Tag>
                    ) : (
                      <Tag>Queued</Tag>
                    )
                  }
                />
              ))}
            </RowList>
          )}
          {!hideEmpty(view.done.length) && (
            <RowList
              title="Done"
              empty={emptyText.done}
              id="done"
              count={view.done.length}
            >
              {view.done.map((row) => (
                <TicketRow
                  key={row.number}
                  muted
                  ticket={row}
                  href={hrefOf(row.number)}
                  icon="check-circle"
                  {...epicParts(row, board, hrefOf)}
                  selection={
                    row.children ? undefined : selectable(row.number, 'done')
                  }
                  line={lineOf(
                    `Done ${age(row.updatedAt)} ago`,
                    row.pullRequest && pullRequestLabel(row.pullRequest),
                    row.cost > 0 && formatCost(row.cost, 'usd'),
                  )}
                  end={<Tag intent="success">Done</Tag>}
                />
              ))}
            </RowList>
          )}
          {!hideEmpty(view.archived.length) && (
            <RowList
              title="Archived"
              empty={emptyText.archived}
              id="archived"
              count={view.archived.length}
            >
              {view.archived.map((ticket) => (
                <TicketRow
                  key={ticket.number}
                  muted
                  ticket={rowOf(ticket)}
                  href={hrefOf(ticket.number)}
                  icon="archive-box"
                  line={`Archived · ${ticket.type === 'Epic' ? 'Epic' : 'Ticket'} · ${age(ticket.updatedAt)} ago`}
                />
              ))}
            </RowList>
          )}
        </Stack>
        {selection.length > 0 && (
          <SelectionBar
            count={selection.length}
            onClear={clearSelection}
            notice={
              refusals &&
              refusals.length > 0 && <NotMoved refusals={refusals} />
            }
          >
            <MoveToCycleMenu
              cycles={cycles}
              cycleId={cycleId}
              disabled={changing}
              onPick={moveSelectionToCycle}
            />
            <AddToEpicMenu
              epics={epics}
              disabled={changing}
              onPick={addSelectionToEpic}
            />
            <Button
              type="button"
              variant="ghost"
              size="small"
              disabled={changing}
              onClick={archiveSelection}
            >
              Archive
            </Button>
          </SelectionBar>
        )}
      </Stack>
    </DndProvider>
  );
};
