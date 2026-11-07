'use client';

import {
  Alert,
  Box,
  Button,
  Grid,
  GridItem,
  Heading,
  Inline,
  Label,
  Stack,
  Switch,
  Text,
  VisuallyHidden,
} from '@blockle/blocks';
import {
  Accessibility,
  type DragDropManagerInput,
  type Draggable,
  type Droppable,
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from '@dnd-kit/dom';
import {
  DragDropProvider as DndProvider,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  useDroppable,
} from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import {
  type FC,
  type MouseEvent,
  useCallback,
  useEffect,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react';

import { moveTicketsToCycle } from '../../app/cycles/actions';
import { modeColors } from '../../app/lib/mode-colors';
import {
  type BoardFilter,
  boardPathOf,
  filteredBoardPath,
  noBoardFilter,
  openTicketNumber,
  ticketOnBoardPath,
} from '../../app/lib/paths';
import {
  archiveTickets,
  completeTicket,
  moveTickets,
  moveTicketsToEpic,
  reorderTickets,
  updateTicket,
} from '../../app/tickets/actions';
import type { Cycle } from '../../tickets/cycles';
import { type EpicLink, epicLinkOf } from '../../tickets/epic-link';
import type { BatchFailure } from '../../tickets/errors';
import type { Status } from '../../tickets/status';
import type { Project, Ticket } from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import { BoardFilterBar } from '../board-filter-bar/board-filter-bar';
import { useLiveConversations } from '../conversation-activity/conversation-activity';
import { EpicChips, epicOfDropTarget } from '../epic-chips/epic-chips';
import { MoveToCycleMenu } from '../move-to-cycle-menu/move-to-cycle-menu';
import { NewTicketInline } from '../new-ticket-inline/new-ticket-inline';
import { SelectionBar } from '../selection-bar/selection-bar';
import { type SelectMode, TicketCard } from '../ticket-card/ticket-card';
import { completed } from './board-changes';
import {
  filteredSelectionDrop,
  isFiltering,
  mergeLaneOrder,
  ticketMatches,
} from './board-filter';
import {
  type BoardLane,
  boardLanes,
  type InProgressSection,
  inProgressSections,
  isBoardLane,
  isInReview,
  isTriageLane,
  type LanePlacement,
  laneOf,
  laneStatus,
} from './board-lanes';

export type BoardProps = {
  project: Project;
  /**
   * The Board's Tickets, archived ones included, oldest-created first. Its
   * Epics stay out of the columns.
   */
  tickets: Ticket[];
  /**
   * The Project's live Epics, oldest-created first, for the row above the
   * columns. A Cycle's Board lists only those in `tickets` or with a child
   * in it, done ones included.
   * Defaults to none.
   */
  epics?: Ticket[];
  /**
   * The number of the Ticket open in the drawer over the Board, if any. Its
   * card or Epic chip is ringed (T379). When it is archived, the Board starts
   * with the archived Tickets shown.
   */
  openTicket?: number;
  /**
   * The tab the Board shows: a Cycle by id, whose new Tickets are planned
   * into it, or `null` for the Backlog. Lanes are reordered within it.
   * Defaults to the whole Project.
   */
  cycleId?: number | null;
  /**
   * The Project's Cycles. On the Backlog a selection can be planned into its
   * Prepared and Active ones. Defaults to none.
   */
  cycles?: Cycle[];
  /**
   * The Board filter in the URL as the Board loads (see `GLOSSARY.md`).
   * The Board keeps it from then on, writing each change back to the URL.
   * Defaults to none.
   */
  filter?: BoardFilter;
};

type CycleRefusalsProps = {
  refusals: BatchFailure[];
};

/** Why each Ticket a move to a Cycle left out was refused. */
const CycleRefusals: FC<CycleRefusalsProps> = ({ refusals }) => {
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

type LaneColumnProps = {
  projectId: number;
  cycleId?: number | null;
  /** The Board's own URL, which a card's drawer opens over. */
  boardPath: string;
  /** The Board filter, which a card's drawer keeps. */
  filter: BoardFilter;
  lane: BoardLane;
  /** Where a Ticket sits now, given its live Conversation. */
  placementOf: (ticket: Ticket) => LanePlacement;
  /** Whether the Ticket sits in Review now, given its live Conversation. */
  inReview: (ticket: Ticket) => boolean;
  tickets: Ticket[];
  /** The number of the Ticket open in the drawer, whose card is ringed. */
  openTicket?: number;
  selected: ReadonlySet<number>;
  /** The card carrying the selection in a drag under way, if any. */
  carrier?: number;
  /** Whether a card dragged now is over the lane or one of its cards. */
  highlighted: boolean;
  onSelect: (ticket: Ticket, mode: SelectMode) => void;
  /** Called with a Review Ticket the User says is merged. */
  onMerged: (ticket: Ticket) => void;
  /** Called with the number of a stalled Ticket sent Back to Todo. */
  onBackToTodo: (number: number) => void;
  /** Called with the number of a Ticket created in the lane. */
  onCreated: (number: number) => void;
};

type TicketCountProps = { count: number };

/** How many Tickets a lane holds, read out as `2 Tickets`. */
const TicketCount: FC<TicketCountProps> = ({ count }) => (
  <Text fontSize="small" color="muted">
    {count}
    <VisuallyHidden> {count === 1 ? 'Ticket' : 'Tickets'}</VisuallyHidden>
  </Text>
);

type TicketListProps = Pick<
  LaneColumnProps,
  | 'boardPath'
  | 'filter'
  | 'openTicket'
  | 'selected'
  | 'carrier'
  | 'onSelect'
  | 'onMerged'
  | 'onBackToTodo'
  | 'lane'
  | 'inReview'
> & {
  tickets: Ticket[];
  /** The group the cards sort in, when it is not the Lane. */
  group?: string;
};

/** The cards of a Lane, or of a section of it. */
const TicketList: FC<TicketListProps> = ({
  lane,
  group = lane,
  inReview,
  tickets,
  boardPath,
  filter,
  openTicket,
  selected,
  carrier,
  onSelect,
  onMerged,
  onBackToTodo,
}) =>
  tickets.length > 0 && (
    <Stack gap={2} listStyle="none" role="list" asChild>
      <ul>
        {tickets.map((ticket, index) => (
          <SortableTicketCard
            key={ticket.number}
            ticket={ticket}
            lane={lane}
            group={group}
            index={index}
            boardPath={boardPath}
            filter={filter}
            open={ticket.number === openTicket}
            selected={selected.has(ticket.number)}
            selecting={selected.size > 0}
            carries={
              selected.size > 1 && selected.has(ticket.number)
                ? selected.size
                : 1
            }
            carrying={carrier === ticket.number}
            carriedAlong={
              carrier !== undefined &&
              carrier !== ticket.number &&
              selected.has(ticket.number)
            }
            onSelect={(mode) => onSelect(ticket, mode)}
            onMerged={inReview(ticket) ? () => onMerged(ticket) : undefined}
            onBackToTodo={() => onBackToTodo(ticket.number)}
          />
        ))}
      </ul>
    </Stack>
  );

type InProgressSectionGroupProps = Omit<TicketListProps, 'lane' | 'group'> & {
  section: InProgressSection;
};

/**
 * A section of the In progress Lane: a heading and count, then its cards.
 * Empty, it is just those. It takes no drops; the Lane does.
 */
const InProgressSectionGroup: FC<InProgressSectionGroupProps> = ({
  section,
  tickets,
  ...cardProps
}) => {
  const headingId = useId();

  return (
    <Stack gap={2} role="group" aria-labelledby={headingId}>
      <Inline gap={2} alignY="center">
        <Heading id={headingId} level={3} fontSize="small">
          {section}
        </Heading>
        <TicketCount count={tickets.length} />
      </Inline>
      <TicketList
        lane="In progress"
        group={`In progress/${section}`}
        tickets={tickets}
        {...cardProps}
      />
    </Stack>
  );
};

/** A Lane; the Todo Lane ends with a field to create a Ticket. */
const LaneColumn: FC<LaneColumnProps> = ({
  projectId,
  cycleId,
  boardPath,
  filter,
  lane,
  placementOf,
  inReview,
  tickets,
  openTicket,
  selected,
  carrier,
  highlighted,
  onSelect,
  onMerged,
  onBackToTodo,
  onCreated,
}) => {
  // Takes a drop between or below its cards: a card under the pointer
  // outranks its lane.
  const { ref } = useDroppable({ id: lane, collisionPriority: 1 });
  const headingId = useId();
  const cardProps = {
    boardPath,
    filter,
    openTicket,
    selected,
    carrier,
    inReview,
    onSelect,
    onMerged,
    onBackToTodo,
  };

  return (
    <Box
      asChild
      backgroundColor={
        highlighted ? modeColors.primarySubtle : modeColors.sunken
      }
      borderRadius={2}
      padding={3}
      blockSize="full"
    >
      <section
        ref={ref}
        aria-labelledby={headingId}
        data-drop-target={highlighted ? '' : undefined}
      >
        <Stack gap={3}>
          <Inline gap={2} alignY="center">
            <Heading id={headingId} level={2} fontSize="medium">
              {lane}
            </Heading>
            <TicketCount count={tickets.length} />
          </Inline>
          {lane === 'In progress' ? (
            <Stack gap={3}>
              {inProgressSections.map((section) => (
                <InProgressSectionGroup
                  key={section}
                  section={section}
                  tickets={tickets.filter(
                    (ticket) => placementOf(ticket).section === section,
                  )}
                  {...cardProps}
                />
              ))}
            </Stack>
          ) : (
            <TicketList lane={lane} tickets={tickets} {...cardProps} />
          )}
          {lane === 'Todo' && (
            <NewTicketInline
              projectId={projectId}
              cycleId={cycleId ?? undefined}
              onCreated={onCreated}
            />
          )}
        </Stack>
      </section>
    </Box>
  );
};

/**
 * A card is dragged from anywhere on it (T242). A mouse drag starts once the
 * pointer moves 5px, so a click still opens or selects; a touch drag after a
 * 250ms press, so a swipe still scrolls. One starting on the card's checkbox
 * selects instead. Space picks up the focused card by keyboard.
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

/**
 * What card `source` carries, for a screen reader: its Ticket, as `T4`, or
 * the selection it is part of, as `3 Tickets`.
 */
const carriedName = (source: Draggable) =>
  source.data.carries > 1 ? `${source.data.carries} Tickets` : `T${source.id}`;

/**
 * What card `source` is over at `target`, for a screen reader: an Epic's
 * chip, as `Epic T20`, or a Lane.
 */
const placeName = (source: Draggable, target: Droppable | null) => {
  const epicNumber = epicOfDropTarget(target?.id);
  if (epicNumber !== undefined) {
    return `Epic T${epicNumber}`;
  }
  // A lane is a Lane by id; a card, the dragged one included, has its own.
  return isBoardLane(target?.id) ? target.id : (target ?? source).data.lane;
};

// dnd-kit does not export the type of its announcements.
type Announcements = NonNullable<
  NonNullable<ConstructorParameters<typeof Accessibility>[1]>['announcements']
>;

/**
 * What a screen reader hears while a card is dragged, naming its Ticket, or
 * how many Tickets it carries (T243), and the Lane or Epic it is over
 * (T242).
 */
const announcements: Announcements = {
  dragstart: ({ operation: { source } }) =>
    source ? `Picked up ${carriedName(source)}.` : undefined,
  dragover: ({ operation: { source, target } }) => {
    if (!source || !target || target.id === source.id) {
      return undefined;
    }
    const verb = source.data.carries > 1 ? 'are' : 'is';
    return `${carriedName(source)} ${verb} over ${placeName(source, target)}.`;
  },
  dragend: ({ operation: { source, target }, canceled }) => {
    if (!source) {
      return undefined;
    }
    if (canceled) {
      // A selection can come from several lanes.
      return source.data.carries > 1
        ? `Cancelled. The ${source.data.carries} Tickets stay where they were.`
        : `Cancelled. T${source.id} stays in ${source.data.lane}.`;
    }
    const onto = epicOfDropTarget(target?.id) === undefined ? 'in' : 'on';
    return `Dropped ${carriedName(source)} ${onto} ${placeName(source, target)}.`;
  },
};

/** dnd-kit's plugins, with `announcements` in place of its own. */
const plugins: DragDropManagerInput['plugins'] = (defaults) => [
  ...defaults.filter((plugin) => plugin !== Accessibility),
  Accessibility.configure({ announcements }),
];

type SortableTicketCardProps = {
  ticket: Ticket;
  lane: BoardLane;
  /** What the card sorts among: its Lane, or its section of the Lane. */
  group: string;
  index: number;
  boardPath: string;
  filter: BoardFilter;
  open: boolean;
  selected: boolean;
  selecting: boolean;
  /** How many Tickets a drag of the card carries: the selection, if it is in one. */
  carries: number;
  /** Whether the card is carrying the selection in a drag under way. */
  carrying: boolean;
  carriedAlong: boolean;
  onSelect: (mode: SelectMode) => void;
  /** Set on a Review card only, which then shows the Merged button. */
  onMerged?: () => void;
  onBackToTodo: () => void;
};

const SortableTicketCard: FC<SortableTicketCardProps> = ({
  ticket,
  lane,
  group,
  index,
  boardPath,
  filter,
  open,
  selected,
  selecting,
  carries,
  carrying,
  carriedAlong,
  onSelect,
  onMerged,
  onBackToTodo,
}) => {
  const { ref } = useSortable({
    id: ticket.number,
    index,
    group,
    data: { lane, carries },
    collisionPriority: 3,
  });

  return (
    <TicketCard
      ticket={ticket}
      boardPath={boardPath}
      filter={filter}
      cardRef={ref}
      open={open}
      selected={selected}
      selecting={selecting}
      carryCount={carrying ? carries : 1}
      carriedAlong={carriedAlong}
      onSelect={onSelect}
      onMerged={onMerged}
      onBackToTodo={onBackToTodo}
    />
  );
};

type ArchivedTicketsProps = {
  tickets: Ticket[];
  boardPath: string;
  filter: BoardFilter;
};

/** The Project's archived Tickets, each a link that opens it in the drawer. */
const ArchivedTickets: FC<ArchivedTicketsProps> = ({
  tickets,
  boardPath,
  filter,
}) => {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <Stack gap={3}>
        <Heading id={headingId} level={2} fontSize="medium">
          Archived Tickets
        </Heading>
        {tickets.length === 0 ? (
          <Text tag="p" color="muted" fontSize="small">
            No archived Tickets
          </Text>
        ) : (
          <Stack gap={2} listStyle="none" role="list" asChild>
            <ul>
              {tickets.map((ticket) => (
                <li key={ticket.number}>
                  <Text color="muted" fontSize="small">
                    T{ticket.number}
                  </Text>{' '}
                  <Text wordBreak="break-word">
                    <AppLink
                      href={ticketOnBoardPath(boardPath, ticket.number, filter)}
                      scroll={false}
                      intent="inherit"
                    >
                      {ticket.title}
                    </AppLink>
                  </Text>
                </li>
              ))}
            </ul>
          </Stack>
        )}
      </Stack>
    </section>
  );
};

type StatusMove = { number: number; status: Status };

type BoardChange =
  | (StatusMove & { position: number })
  | { status: Status; ticketNumbers: number[] }
  | { status: Status; laneOrder: number[] }
  | { numbers: number[]; epic: EpicLink }
  | { numbers: number[]; archived: true }
  | { merged: number };

const applyBoardChange = (tickets: Ticket[], change: BoardChange) => {
  if ('laneOrder' in change) {
    // A selection moved into a lane: every Ticket in it takes its Status.
    const positions = new Map(
      change.laneOrder.map((number, position) => [number, position]),
    );
    return tickets.map((ticket) => {
      const position = positions.get(ticket.number);
      return position === undefined
        ? ticket
        : { ...ticket, status: change.status, position };
    });
  }
  if ('merged' in change) {
    // The completion rule: Done, and the triage state label gone.
    return tickets.map((ticket) =>
      ticket.number === change.merged ? completed(ticket) : ticket,
    );
  }
  if ('archived' in change) {
    return tickets.map((ticket) =>
      change.numbers.includes(ticket.number)
        ? { ...ticket, archived: true }
        : ticket,
    );
  }
  if ('epic' in change) {
    return tickets.map((ticket) =>
      change.numbers.includes(ticket.number)
        ? { ...ticket, epic: change.epic }
        : ticket,
    );
  }
  if ('ticketNumbers' in change) {
    const positions = new Map(
      change.ticketNumbers.map((number, position) => [number, position]),
    );
    return tickets.map((ticket) =>
      ticket.status === change.status && positions.has(ticket.number)
        ? {
            ...ticket,
            position: positions.get(ticket.number) ?? ticket.position,
          }
        : ticket,
    );
  }
  return tickets.map((ticket) =>
    ticket.number === change.number
      ? { ...ticket, status: change.status, position: change.position }
      : ticket,
  );
};

type EpicJoin = { joining: Ticket[]; epicNumber: number };
type EpicChange = EpicJoin | { merged: number };

/**
 * `epics` with `joining` taken out of their Epics and into Epic `epicNumber`,
 * or with Epic `merged` completed: it and its unarchived children are Done
 * and lose their triage state label.
 */
const applyEpicChange = (epics: Ticket[], change: EpicChange) => {
  if ('merged' in change) {
    return epics.map((epic) =>
      epic.number === change.merged
        ? {
            ...completed(epic),
            children: epic.children.map((child) =>
              child.archived ? child : { ...child, status: 'Done' as const },
            ),
          }
        : epic,
    );
  }
  const { joining, epicNumber } = change;
  const numbers = new Set(joining.map(({ number }) => number));
  return epics.map((epic) => {
    const children = epic.children.filter(
      (candidate) => !numbers.has(candidate.number),
    );
    if (epic.number === epicNumber) {
      for (const child of joining) {
        const { number, title, status, archived, blockedBy, blocked } = child;
        children.push({ number, title, status, archived, blockedBy, blocked });
      }
    }
    return { ...epic, children };
  });
};

/** Clicks inside these are not on empty Board space. */
const notEmptySpaceSelector =
  'a, button, input, textarea, select, label, form, li, [data-selection-bar], dialog, [role="dialog"]';

/** Where Escape belongs to the control, not to the selection. */
const escapeOwnerSelector =
  'input:not([type="checkbox"]), textarea, select, dialog, [role="dialog"]';

/**
 * A Project's Board: its Epics' row, and one column per Status holding its
 * active normal Tickets, plus a "Show archived" switch, with their count,
 * that lists archived Tickets below. Tickets can be reordered by dragging or moved between Statuses; both
 * changes save through Server Actions and roll back optimistically if
 * refused.
 *
 * Cards can be selected with Cmd-click or Ctrl-click, a Shift-click range in
 * one column, or their checkboxes; a bar then shows the selection. Dragging
 * a selected card moves the whole selection, into a lane or, dropped on an
 * Epic's chip, into that Epic; the dragged card shows how many Tickets it
 * carries, and the rest of the selection is dimmed in place. The bar's
 * Archive archives the selection without asking, since each Ticket can be
 * restored. The bar's "Move to Cycle" moves the selection into another
 * Cycle, or from a Cycle's Board to the Backlog, and leaves the refused
 * Tickets selected, with their reasons. The selection lives only
 * in this tab and drops Tickets that leave the Board.
 */
export const Board: FC<BoardProps> = ({
  project,
  tickets,
  epics = [],
  openTicket,
  cycleId,
  cycles = [],
  filter: initialFilter = noBoardFilter,
}) => {
  const boardPath = boardPathOf(project.id, cycleId ?? null);
  // Read once for all cards: a live Conversation decides the section (T1065).
  const liveConversations = useLiveConversations();
  const placementOf = (ticket: Ticket) =>
    laneOf(ticket, liveConversations[ticket.number]);
  const inReview = (ticket: Ticket) =>
    isInReview(ticket, liveConversations[ticket.number]);
  const [filter, setFilter] = useState(initialFilter);
  const filterUrlTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The URL's filter as last rendered, and as the Board last wrote it.
  const urlFilter = filteredBoardPath('', initialFilter);
  const [renderedUrlFilter, setRenderedUrlFilter] = useState(urlFilter);
  const [writtenUrlFilter, setWrittenUrlFilter] = useState(urlFilter);
  const [filterResets, setFilterResets] = useState(0);
  if (urlFilter !== renderedUrlFilter) {
    setRenderedUrlFilter(urlFilter);
    if (urlFilter !== writtenUrlFilter) {
      // Navigated to this Board with another filter, such as none: follow it.
      setFilter(initialFilter);
      setWrittenUrlFilter(urlFilter);
      setFilterResets((count) => count + 1);
    }
  }
  const [created, setCreated] = useState<number>();
  const [shownTickets, showChange] = useOptimistic(tickets, applyBoardChange);
  const [shownEpics, showEpicChange] = useOptimistic(epics, applyEpicChange);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();
  const [changingCycle, startCycleChange] = useTransition();
  const [cycleRefusals, setCycleRefusals] = useState<CycleRefusalsProps>();
  const [showArchived, setShowArchived] = useState(() =>
    tickets.some((ticket) => ticket.number === openTicket && ticket.archived),
  );
  const [overLane, setOverLane] = useState<BoardLane>();
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const selectionAnchor = useRef<number | undefined>(undefined);
  const dragging = useRef(false);
  const [carrier, setCarrier] = useState<number>();
  const switchId = useId();
  const matches = (ticket: Ticket) => ticketMatches(ticket, filter);
  const active = shownTickets.filter(
    (ticket) => !ticket.archived && ticket.type !== 'Epic',
  );
  const byNumber = new Map(
    shownTickets.map((ticket) => [ticket.number, ticket]),
  );
  const planned = new Set(
    tickets.filter((ticket) => !ticket.archived).map(({ number }) => number),
  );
  const rowEpics = (
    typeof cycleId === 'number'
      ? shownEpics.filter(
          (epic) =>
            planned.has(epic.number) ||
            epic.children.some((child) => planned.has(child.number)),
        )
      : shownEpics
  ).filter(
    // A child is judged by its Ticket on this Board, which has its Labels.
    (epic) =>
      matches(epic) ||
      epic.children.some((child) => {
        const childTicket = byNumber.get(child.number);
        return childTicket !== undefined && matches(childTicket);
      }),
  );
  const allArchived = shownTickets.filter((ticket) => ticket.archived);
  const archived = allArchived.filter(matches);
  // Every lane in full, and as the filter shows it. A Lane holds its Status's
  // order, filtered, so positions stay per Status.
  const fullLanes = boardLanes.map((lane) =>
    active
      .filter((ticket) => placementOf(ticket).lane === lane)
      .sort(
        (left, right) =>
          left.position - right.position || left.number - right.number,
      ),
  );
  const lanes = fullLanes.map((lane) => lane.filter(matches));
  const shownLane = (lane: BoardLane) => lanes[boardLanes.indexOf(lane)];
  /** Status `status` in full, over all the Lanes that show it, in order. */
  const statusLane = (status: Status) =>
    active
      .filter(
        (ticket) => ticket.projectId === project.id && ticket.status === status,
      )
      .sort(
        (left, right) =>
          left.position - right.position || left.number - right.number,
      )
      .map(({ number }) => number);
  /**
   * Whether `tickets` may be dropped into `lane`: not from one of Intake,
   * Todo and For human into another, which would need a label change.
   */
  const mayDrop = (tickets: Ticket[], lane: BoardLane) =>
    !isTriageLane(lane) ||
    tickets.every(
      (ticket) =>
        !isTriageLane(placementOf(ticket).lane) ||
        placementOf(ticket).lane === lane,
    );
  const filterLabels = [
    ...new Set([...tickets, ...epics, filter].flatMap(({ labels }) => labels)),
  ].sort();
  const nothingMatches =
    isFiltering(filter) &&
    lanes.every((lane) => lane.length === 0) &&
    rowEpics.length === 0 &&
    archived.length === 0;
  const createdTicket =
    created === undefined
      ? undefined
      : (byNumber.get(created) ??
        shownEpics.find(({ number }) => number === created));
  if (createdTicket !== undefined && matches(createdTicket)) {
    // Shown as it arrived: an edit hiding it later needs no notice.
    setCreated(undefined);
  }
  const createdHidden = createdTicket !== undefined && !matches(createdTicket);
  // In Board order.
  const selection = lanes
    .flat()
    .filter((ticket) => selected.has(ticket.number));
  const selectedOnBoard = new Set(selection.map(({ number }) => number));
  // Judged by the saved Board, not the shown one: a selection being archived
  // stays selected until the archive is saved, so a refused one comes back
  // selected.
  const savedOnBoard = new Set(
    tickets
      .filter(
        (ticket) =>
          !ticket.archived && ticket.type !== 'Epic' && matches(ticket),
      )
      .map(({ number }) => number),
  );
  if ([...selected].some((number) => !savedOnBoard.has(number))) {
    // A Ticket that left the Board, or that the filter hides, drops out, so
    // it is not selected if it comes back.
    setSelected(
      new Set([...selected].filter((number) => savedOnBoard.has(number))),
    );
  }
  // A refused Ticket that has since left the Board, or the selection, drops out.
  const shownRefusals =
    cycleRefusals?.refusals.filter(({ number }) =>
      selectedOnBoard.has(number),
    ) ?? [];
  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setCycleRefusals(undefined);
    selectionAnchor.current = undefined;
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on each reset to the URL's filter.
  useEffect(() => () => clearTimeout(filterUrlTimer.current), [filterResets]);

  useEffect(() => {
    if (created === undefined) {
      return;
    }
    const timer = setTimeout(() => setCreated(undefined), 5000);
    return () => clearTimeout(timer);
  }, [created]);

  /**
   * Shows the Board under `next` at once, and puts it in the URL in place
   * of the history entry: after a pause while the search is `typing`.
   */
  const changeFilter = (next: BoardFilter, typing = false) => {
    setFilter(next);
    setCreated(undefined);
    clearTimeout(filterUrlTimer.current);
    const writeUrl = () => {
      // A drawer opened meanwhile stays open.
      const ticket = openTicketNumber(
        new URLSearchParams(window.location.search).get('ticket') ?? undefined,
      );
      window.history.replaceState(
        null,
        '',
        filteredBoardPath(boardPath, next, ticket),
      );
      setWrittenUrlFilter(filteredBoardPath('', next));
    };
    if (typing) {
      filterUrlTimer.current = setTimeout(writeUrl, 300);
    } else {
      writeUrl();
    }
  };

  useEffect(() => {
    if (selected.size === 0) {
      return;
    }
    const clearOnEscape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        dragging.current ||
        (event.target instanceof Element &&
          event.target.closest(escapeOwnerSelector))
      ) {
        return;
      }
      clearSelection();
    };
    document.addEventListener('keydown', clearOnEscape);
    return () => document.removeEventListener('keydown', clearOnEscape);
  }, [selected, clearSelection]);

  const select = (ticket: Ticket, mode: SelectMode) => {
    setCycleRefusals(undefined);
    const lane = shownLane(placementOf(ticket).lane).map(
      ({ number }) => number,
    );
    const from =
      mode === 'range' && selectionAnchor.current !== undefined
        ? lane.indexOf(selectionAnchor.current)
        : -1;
    if (from >= 0) {
      const to = lane.indexOf(ticket.number);
      const range = lane.slice(Math.min(from, to), Math.max(from, to) + 1);
      setSelected((current) => new Set([...current, ...range]));
      return;
    }
    selectionAnchor.current = ticket.number;
    setSelected((current) => {
      const next = new Set(current);
      if (mode === 'toggle' && next.has(ticket.number)) {
        next.delete(ticket.number);
      } else {
        next.add(ticket.number);
      }
      return next;
    });
  };

  const clearOnEmptyClick = (event: MouseEvent) => {
    if (
      selected.size > 0 &&
      event.target instanceof Element &&
      !event.target.closest(notEmptySpaceSelector)
    ) {
      clearSelection();
    }
  };

  const changeStatus = (number: number, status: Status) => {
    setError(undefined);
    startTransition(async () => {
      const position =
        Math.max(
          -1,
          ...shownTickets
            .filter(
              (ticket) =>
                ticket.projectId === project.id && ticket.status === status,
            )
            .map((ticket) => ticket.position),
        ) + 1;
      showChange({ number, status, position });
      const result = await updateTicket({ number, status });
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  const markMerged = ({ number }: Ticket) => {
    setError(undefined);
    startTransition(async () => {
      showChange({ merged: number });
      const result = await completeTicket({ number });
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  const markEpicMerged = (epic: Ticket) => {
    setError(undefined);
    startTransition(async () => {
      showEpicChange({ merged: epic.number });
      for (const child of epic.children) {
        if (!child.archived) {
          showChange({ merged: child.number });
        }
      }
      const result = await completeTicket({ number: epic.number });
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  const changeOrder = (status: Status, ticketNumbers: number[]) => {
    setError(undefined);
    startTransition(async () => {
      showChange({ status, ticketNumbers });
      const result = await reorderTickets({
        projectId: project.id,
        status,
        ticketNumbers,
        ...(cycleId === undefined ? {} : { cycleId }),
      });
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  /**
   * Moves the selection, carried by card `sourceId`, into `target`'s Lane
   * where it was dropped on `targetId` (see `selectionDrop`).
   */
  const moveSelection = (
    target: BoardLane,
    sourceId: number,
    targetId: string | number | undefined,
  ) => {
    const status = laneStatus(target);
    const moving = selection.map(({ number }) => number);
    // The other Lanes of the Status count as hidden Tickets.
    const lane = statusLane(status);
    const { before, laneOrder } = filteredSelectionDrop(
      lane,
      shownLane(target).map(({ number }) => number),
      moving,
      sourceId,
      typeof targetId === 'number' ? targetId : undefined,
    );
    if (
      selection.every((ticket) => ticket.status === status) &&
      laneOrder.every((number, index) => number === lane[index])
    ) {
      return;
    }
    setError(undefined);
    startTransition(async () => {
      showChange({ status, laneOrder });
      const result = await moveTickets({
        projectId: project.id,
        ticketNumbers: moving,
        status,
        before,
      });
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  /**
   * Attaches `moving` to Epic `epicNumber`, taking them out of their Epics,
   * as one change, all or nothing.
   */
  const joinEpic = (moving: Ticket[], epicNumber: number) => {
    const epic = shownEpics.find(({ number }) => number === epicNumber);
    const joining = moving.filter(
      (ticket) => ticket.epic?.number !== epicNumber,
    );
    if (!epic || joining.length === 0) {
      return;
    }
    const numbers = joining.map(({ number }) => number);
    setError(undefined);
    startTransition(async () => {
      showChange({ numbers, epic: epicLinkOf(epic) });
      showEpicChange({ joining, epicNumber });
      const result = await moveTicketsToEpic({
        epic: epicNumber,
        children: numbers,
      });
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  /** Archives the selection as one change, all or nothing. */
  const archiveSelection = () => {
    const numbers = selection.map(({ number }) => number);
    setError(undefined);
    startTransition(async () => {
      showChange({ numbers, archived: true });
      const result = await archiveTickets({ ticketNumbers: numbers });
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  /**
   * Moves the selection into Cycle `targetCycleId`, or to the Backlog when it
   * is `null`, Ticket by Ticket. The selection shrinks to the Tickets
   * refused, listed with their reasons; a batch refused as a whole leaves it
   * as it was.
   */
  const moveSelectionToCycle = (targetCycleId: number | null) => {
    const numbers = selection.map(({ number }) => number);
    setError(undefined);
    setCycleRefusals(undefined);
    startCycleChange(async () => {
      const result = await moveTicketsToCycle({
        projectId: project.id,
        cycleId: targetCycleId,
        ticketNumbers: numbers,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const refused = new Set(result.failed.map(({ number }) => number));
      // Only the changed Tickets leave: cards picked meanwhile stay selected.
      setSelected(
        (current) =>
          new Set(
            [...current].filter(
              (number) => !numbers.includes(number) || refused.has(number),
            ),
          ),
      );
      if (result.failed.length > 0) {
        setCycleRefusals({ refusals: result.failed });
      }
    });
  };

  const followDrag = (event: DragOverEvent) => {
    const sourceId = event.operation.source?.id;
    const targetId = event.operation.target?.id;
    // dnd-kit would move the card's element into the other lane's list,
    // which React then fails to remove from its own list on the drop.
    const lanePlaced = (id: unknown) => {
      const found = shownTickets.find((ticket) => ticket.number === id);
      return found && placementOf(found).lane;
    };
    const targetLane = lanePlaced(targetId);
    if (targetLane !== undefined && targetLane !== lanePlaced(sourceId)) {
      event.preventDefault();
    }
    // The lane under the pointer, whether over the lane or one of its cards.
    const over = isBoardLane(targetId) ? targetId : targetLane;
    const dragged = shownTickets.find((ticket) => ticket.number === sourceId);
    // A drop that would be refused is not shown as a drop target.
    setOverLane(
      over !== undefined && dragged && !mayDrop([dragged], over)
        ? undefined
        : over,
    );
  };

  const startDrag = (event: DragStartEvent) => {
    dragging.current = true;
    const sourceId = event.operation.source?.id;
    if (
      typeof sourceId === 'number' &&
      selectedOnBoard.has(sourceId) &&
      selection.length > 1
    ) {
      setCarrier(sourceId);
    }
  };

  const finishDrag = (event: DragEndEvent) => {
    dragging.current = false;
    setCarrier(undefined);
    setOverLane(undefined);
    const { source, target } = event.operation;
    const sourceId = source?.id;
    if (event.canceled) {
      return;
    }
    if (typeof sourceId !== 'number') {
      return;
    }
    const ticket = shownTickets.find(
      (candidate) => candidate.number === sourceId,
    );
    if (!ticket || ticket.archived) {
      return;
    }
    // Over its own slot, the card is either where it started, and stays
    // there, or where dnd-kit's sorting moved it within its lane: in the
    // place of the card that held that slot.
    const targetId =
      target?.id === sourceId
        ? isSortable(source) && source.index !== source.initialIndex
          ? shownLane(placementOf(ticket).lane).filter(
              (other) =>
                placementOf(other).section === placementOf(ticket).section,
            )[source.index]?.number
          : undefined
        : target?.id;
    const carriesSelection =
      selectedOnBoard.has(sourceId) && selection.length > 1;
    const epicNumber = epicOfDropTarget(targetId);
    if (epicNumber !== undefined) {
      joinEpic(carriesSelection ? selection : [ticket], epicNumber);
      return;
    }
    const targetTicket =
      typeof targetId === 'number'
        ? shownTickets.find((candidate) => candidate.number === targetId)
        : undefined;
    const targetLane = isBoardLane(targetId)
      ? targetId
      : targetTicket && placementOf(targetTicket).lane;
    if (!targetLane) {
      return;
    }
    // Dropping between Intake, Todo and For human would change a label, which
    // a drag does not do: the card snaps back.
    if (!mayDrop(carriesSelection ? selection : [ticket], targetLane)) {
      return;
    }
    const status = laneStatus(targetLane);
    if (carriesSelection) {
      moveSelection(targetLane, sourceId, targetId);
      return;
    }
    if (placementOf(ticket).lane !== targetLane) {
      changeStatus(sourceId, status);
      return;
    }
    const lane = statusLane(status);
    const laneShown = shownLane(targetLane).map(({ number }) => number);
    const sourceIndex = laneShown.indexOf(sourceId);
    // Onto a card, it takes that card's place; onto the lane, the end.
    const targetIndex =
      typeof targetId === 'number'
        ? laneShown.indexOf(targetId)
        : laneShown.length - 1;
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return;
    }
    laneShown.splice(sourceIndex, 1);
    laneShown.splice(targetIndex, 0, sourceId);
    // Hidden Tickets, and those of the Status's other Lanes, keep their
    // places around the shown ones.
    changeOrder(status, mergeLaneOrder(lane, laneShown, [sourceId]));
  };

  return (
    // A click on empty Board space clears the selection, a pointer shortcut:
    // Escape and the bar's Clear button do it by keyboard.
    <Stack gap={4} onClick={clearOnEmptyClick}>
      {error && <Alert intent="danger">{error}</Alert>}
      <BoardFilterBar
        filter={filter}
        labels={filterLabels}
        onChange={changeFilter}
      />
      {nothingMatches && (
        <Inline gap={2} alignY="center">
          <Text tag="p" color="muted">
            No Tickets match
          </Text>
          <Button
            type="button"
            variant="ghost"
            size="small"
            onClick={() => changeFilter(noBoardFilter)}
          >
            Clear filter
          </Button>
        </Inline>
      )}
      {/* Always there, so a screen reader announces what it comes to say. */}
      <Text tag="p" role="status" color="muted" fontSize="small">
        {createdHidden &&
          `T${createdTicket.number} created, hidden by the filter`}
      </Text>
      <DndProvider
        sensors={sensors}
        plugins={plugins}
        onDragStart={startDrag}
        onDragOver={followDrag}
        onDragEnd={finishDrag}
      >
        <EpicChips
          epics={rowEpics}
          projectId={project.id}
          cycleId={cycleId ?? undefined}
          boardPath={boardPath}
          filter={filter}
          openTicket={openTicket}
          hideDone={typeof cycleId !== 'number'}
          onCreated={setCreated}
          onMerged={markEpicMerged}
        />
        <Grid gap={3}>
          {boardLanes.map((lane) => (
            <GridItem key={lane} colSpan={[12, 6, 4]}>
              <LaneColumn
                projectId={project.id}
                cycleId={cycleId}
                boardPath={boardPath}
                filter={filter}
                lane={lane}
                placementOf={placementOf}
                inReview={inReview}
                tickets={shownLane(lane)}
                openTicket={openTicket}
                selected={selectedOnBoard}
                carrier={carrier}
                highlighted={overLane === lane}
                onSelect={select}
                onMerged={markMerged}
                onBackToTodo={(number) => changeStatus(number, 'Todo')}
                onCreated={setCreated}
              />
            </GridItem>
          ))}
        </Grid>
      </DndProvider>
      {selection.length > 0 && (
        <SelectionBar
          count={selection.length}
          onClear={clearSelection}
          notice={
            shownRefusals.length > 0 && (
              <CycleRefusals refusals={shownRefusals} />
            )
          }
        >
          <MoveToCycleMenu
            cycles={cycles}
            cycleId={cycleId ?? null}
            disabled={changingCycle}
            onPick={moveSelectionToCycle}
          />
          <Button
            type="button"
            variant="ghost"
            size="small"
            disabled={changingCycle}
            onClick={archiveSelection}
          >
            Archive
          </Button>
        </SelectionBar>
      )}
      <Inline gap={2} alignY="center">
        <Switch
          id={switchId}
          checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)}
        />
        <Label htmlFor={switchId}>Show archived ({archived.length})</Label>
      </Inline>
      {showArchived && (
        <ArchivedTickets
          tickets={archived}
          boardPath={boardPath}
          filter={filter}
        />
      )}
    </Stack>
  );
};
