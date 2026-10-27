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
  useDroppable,
} from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
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

import { planTickets, unplanTickets } from '../../app/cycles/actions';
import { boardPathOf, ticketOnBoardPath } from '../../app/lib/paths';
import {
  archiveTickets,
  moveTickets,
  moveTicketsToEpic,
  reorderTickets,
  updateTicket,
} from '../../app/tickets/actions';
import type { Cycle } from '../../tickets/cycles';
import type { BatchFailure } from '../../tickets/errors';
import { isStatus, type Status, statuses } from '../../tickets/status';
import {
  type EpicLink,
  epicLinkOf,
  type Project,
  type Ticket,
} from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import { EpicChips, epicOfDropTarget } from '../epic-chips/epic-chips';
import { NewTicketInline } from '../new-ticket-inline/new-ticket-inline';
import { PlanIntoCycleMenu } from '../plan-into-cycle-menu/plan-into-cycle-menu';
import { SelectionBar } from '../selection-bar/selection-bar';
import { type SelectMode, TicketCard } from '../ticket-card/ticket-card';
import * as styles from './board.css';
import { selectionDrop } from './selection-drop';

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
   * The number of the Ticket open in the drawer over the Board, if any. When
   * it is archived, the Board starts with the archived Tickets shown.
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
};

type CycleRefusalsProps = {
  /** What the refused change was, such as `Not planned`; it names the list. */
  heading: string;
  refusals: BatchFailure[];
};

/** Why each Ticket a Cycle change left out was refused. */
const CycleRefusals: FC<CycleRefusalsProps> = ({ heading, refusals }) => {
  const headingId = useId();
  return (
    <Alert intent="warning">
      <Stack gap={1}>
        <Text id={headingId}>{heading}</Text>
        <Stack
          gap={1}
          tag="ul"
          className={styles.ticketList}
          aria-labelledby={headingId}
        >
          {refusals.map(({ number, error }) => (
            <li key={number}>{error}</li>
          ))}
        </Stack>
      </Stack>
    </Alert>
  );
};

type StatusColumnProps = {
  projectId: number;
  cycleId?: number | null;
  /** The Board's own URL, which a card's drawer opens over. */
  boardPath: string;
  status: Status;
  tickets: Ticket[];
  selected: ReadonlySet<number>;
  onSelect: (ticket: Ticket, mode: SelectMode) => void;
};

type TicketCountProps = { count: number };

/** How many Tickets a lane holds, read out as `2 Tickets`. */
const TicketCount: FC<TicketCountProps> = ({ count }) => (
  <Text fontSize="small" color="text-600">
    {count}
    <VisuallyHidden> {count === 1 ? 'Ticket' : 'Tickets'}</VisuallyHidden>
  </Text>
);

/** A Status lane; the Todo lane ends with a field to create a Ticket. */
const StatusColumn: FC<StatusColumnProps> = ({
  projectId,
  cycleId,
  boardPath,
  status,
  tickets,
  selected,
  onSelect,
}) => {
  const { ref, isDropTarget } = useDroppable({
    id: status,
    disabled: tickets.length > 0,
    collisionPriority: 1,
  });
  const headingId = useId();

  return (
    <Box
      asChild
      backgroundColor={isDropTarget ? 'primary-100' : 'neutral-100'}
      borderRadius={2}
      padding={3}
      blockSize="full"
    >
      <section ref={ref} aria-labelledby={headingId}>
        <Stack gap={3}>
          <Inline gap={2} alignY="center">
            <Heading id={headingId} level={2} fontSize="medium">
              {status}
            </Heading>
            <TicketCount count={tickets.length} />
          </Inline>
          {tickets.length === 0 ? (
            <Text tag="p" color="text-600" fontSize="small">
              No Tickets
            </Text>
          ) : (
            <Stack gap={2} tag="ul" className={styles.ticketList}>
              {tickets.map((ticket, index) => (
                <SortableTicketCard
                  key={ticket.number}
                  ticket={ticket}
                  index={index}
                  boardPath={boardPath}
                  selected={selected.has(ticket.number)}
                  selecting={selected.size > 0}
                  onSelect={(mode) => onSelect(ticket, mode)}
                />
              ))}
            </Stack>
          )}
          {status === 'Todo' && (
            <NewTicketInline
              projectId={projectId}
              cycleId={cycleId ?? undefined}
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

/** Where card `source` lands over `target`: an Epic's chip or a Status. */
const dropPlace = (source: Draggable, target: Droppable | null) => {
  const epicNumber = epicOfDropTarget(target?.id);
  if (epicNumber !== undefined) {
    return `on Epic T${epicNumber}`;
  }
  // A lane is a Status by id; a card, the dragged one included, has its own.
  const status = isStatus(target?.id)
    ? target.id
    : (target ?? source).data.status;
  return `in ${status}`;
};

// dnd-kit does not export the type of its announcements.
type Announcements = NonNullable<
  NonNullable<ConstructorParameters<typeof Accessibility>[1]>['announcements']
>;

/** What a screen reader hears while a card is dragged, naming its Ticket. */
const announcements: Announcements = {
  dragstart: ({ operation: { source } }) =>
    source ? `Picked up T${source.id}.` : undefined,
  dragend: ({ operation: { source, target }, canceled }) => {
    if (!source) {
      return undefined;
    }
    return canceled
      ? `Cancelled. T${source.id} stays in ${source.data.status}.`
      : `Dropped T${source.id} ${dropPlace(source, target)}.`;
  },
};

/** dnd-kit's plugins, with `announcements` in place of its own. */
const plugins: DragDropManagerInput['plugins'] = (defaults) => [
  ...defaults.filter((plugin) => plugin !== Accessibility),
  Accessibility.configure({ announcements }),
];

type SortableTicketCardProps = {
  ticket: Ticket;
  index: number;
  boardPath: string;
  selected: boolean;
  selecting: boolean;
  onSelect: (mode: SelectMode) => void;
};

const SortableTicketCard: FC<SortableTicketCardProps> = ({
  ticket,
  index,
  boardPath,
  selected,
  selecting,
  onSelect,
}) => {
  const { ref } = useSortable({
    id: ticket.number,
    index,
    group: ticket.status,
    data: { status: ticket.status },
    collisionPriority: 3,
  });

  return (
    <TicketCard
      ticket={ticket}
      boardPath={boardPath}
      cardRef={ref}
      selected={selected}
      selecting={selecting}
      onSelect={onSelect}
    />
  );
};

type ArchivedTicketsProps = { tickets: Ticket[]; boardPath: string };

/** The Project's archived Tickets, each a link that opens it in the drawer. */
const ArchivedTickets: FC<ArchivedTicketsProps> = ({ tickets, boardPath }) => {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <Stack gap={3}>
        <Heading id={headingId} level={2} fontSize="medium">
          Archived Tickets
        </Heading>
        {tickets.length === 0 ? (
          <Text tag="p" color="text-600" fontSize="small">
            No archived Tickets
          </Text>
        ) : (
          <Stack gap={2} tag="ul" className={styles.ticketList}>
            {tickets.map((ticket) => (
              <li key={ticket.number}>
                <Text color="text-600" fontSize="small">
                  T{ticket.number}
                </Text>{' '}
                <Text wordBreak="break-word">
                  <AppLink
                    href={ticketOnBoardPath(boardPath, ticket.number)}
                    scroll={false}
                    variant="inherit"
                  >
                    {ticket.title}
                  </AppLink>
                </Text>
              </li>
            ))}
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
  | { numbers: number[]; archived: true };

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

/** `epics` with `joining` taken out of their Epics and into Epic `epicNumber`. */
const applyEpicJoin = (epics: Ticket[], { joining, epicNumber }: EpicJoin) => {
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
 * Epic's chip, into that Epic. The bar's Archive archives the selection
 * without asking, since each Ticket can be restored. On the Backlog the bar
 * plans the selection into a Cycle, and on a Cycle's Board it removes the
 * selection from that Cycle; either leaves the refused Tickets selected,
 * with their reasons. The selection lives
 * only in this tab and drops Tickets that leave the Board.
 */
export const Board: FC<BoardProps> = ({
  project,
  tickets,
  epics = [],
  openTicket,
  cycleId,
  cycles = [],
}) => {
  const boardPath = boardPathOf(project.id, cycleId ?? null);
  const [shownTickets, showChange] = useOptimistic(tickets, applyBoardChange);
  const [shownEpics, showEpicJoin] = useOptimistic(epics, applyEpicJoin);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();
  const [changingCycle, startCycleChange] = useTransition();
  const [cycleRefusals, setCycleRefusals] = useState<CycleRefusalsProps>();
  const [showArchived, setShowArchived] = useState(() =>
    tickets.some((ticket) => ticket.number === openTicket && ticket.archived),
  );
  const lastDropTarget = useRef<string | number | undefined>(undefined);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const selectionAnchor = useRef<number | undefined>(undefined);
  const dragging = useRef(false);
  const switchId = useId();
  const active = shownTickets.filter(
    (ticket) => !ticket.archived && ticket.type !== 'Epic',
  );
  const planned = new Set(
    tickets.filter((ticket) => !ticket.archived).map(({ number }) => number),
  );
  const rowEpics =
    typeof cycleId === 'number'
      ? shownEpics.filter(
          (epic) =>
            planned.has(epic.number) ||
            epic.children.some((child) => planned.has(child.number)),
        )
      : shownEpics;
  const archived = shownTickets.filter((ticket) => ticket.archived);
  const plannable = cycles.filter(({ state }) => state !== 'Archived');
  const lanes = statuses.map((status) =>
    active
      .filter((ticket) => ticket.status === status)
      .sort(
        (left, right) =>
          left.position - right.position || left.number - right.number,
      ),
  );
  const laneOf = (status: Status) => lanes[statuses.indexOf(status)];
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
      .filter((ticket) => !ticket.archived && ticket.type !== 'Epic')
      .map(({ number }) => number),
  );
  if ([...selected].some((number) => !savedOnBoard.has(number))) {
    // A Ticket that left the Board drops out, so it is not selected if it
    // comes back.
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
    const lane = laneOf(ticket.status).map(({ number }) => number);
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
   * Moves the selection, carried by card `sourceId`, into `status`'s lane
   * where it was dropped on `targetId` (see `selectionDrop`).
   */
  const moveSelection = (
    status: Status,
    sourceId: number,
    targetId: string | number | undefined,
  ) => {
    const moving = selection.map(({ number }) => number);
    const lane = laneOf(status).map(({ number }) => number);
    const { before, laneOrder } = selectionDrop(
      lane,
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
      showEpicJoin({ joining, epicNumber });
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
   * Plans the selection into Cycle `targetCycleId`, or takes it out of it,
   * Ticket by Ticket. The selection shrinks to the Tickets refused, listed
   * with their reasons; a batch refused as a whole leaves it as it was.
   */
  const changeSelectionCycle = (
    action: typeof planTickets,
    targetCycleId: number,
    heading: string,
  ) => {
    const numbers = selection.map(({ number }) => number);
    setError(undefined);
    setCycleRefusals(undefined);
    startCycleChange(async () => {
      const result = await action({
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
        setCycleRefusals({ heading, refusals: result.failed });
      }
    });
  };

  const rememberDropTarget = (event: DragOverEvent) => {
    const sourceId = event.operation.source?.id;
    const targetId = event.operation.target?.id;
    if (targetId !== undefined && targetId !== sourceId) {
      lastDropTarget.current = targetId;
    }
    // dnd-kit would move the card's element into the other column's list,
    // which React then fails to remove from its own list on the drop.
    const statusOf = (id: unknown) =>
      shownTickets.find((ticket) => ticket.number === id)?.status;
    const targetStatus = statusOf(targetId);
    if (targetStatus !== undefined && targetStatus !== statusOf(sourceId)) {
      event.preventDefault();
    }
  };

  const finishDrag = (event: DragEndEvent) => {
    dragging.current = false;
    const sourceId = event.operation.source?.id;
    const operationTargetId = event.operation.target?.id;
    // Dropped back on its own slot: take the card it was last over, but not
    // a chip it passed on the way, or it would join that Epic.
    const targetId =
      sourceId === operationTargetId &&
      lastDropTarget.current !== undefined &&
      epicOfDropTarget(lastDropTarget.current) === undefined
        ? lastDropTarget.current
        : operationTargetId;
    lastDropTarget.current = undefined;
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
    const status = isStatus(targetId) ? targetId : targetTicket?.status;
    if (!status) {
      return;
    }
    if (carriesSelection) {
      moveSelection(status, sourceId, targetId);
      return;
    }
    if (ticket.status !== status) {
      changeStatus(sourceId, status);
      return;
    }
    if (typeof targetId !== 'number' || targetId === sourceId) {
      return;
    }
    const lane = shownTickets
      .filter(
        (candidate) =>
          !candidate.archived &&
          candidate.projectId === project.id &&
          candidate.status === status,
      )
      .sort(
        (left, right) =>
          left.position - right.position || left.number - right.number,
      )
      .map((candidate) => candidate.number);
    const sourceIndex = lane.indexOf(sourceId);
    const targetIndex = lane.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }
    lane.splice(sourceIndex, 1);
    lane.splice(targetIndex, 0, sourceId);
    changeOrder(status, lane);
  };

  return (
    // `Stack` takes no `onClick` and has no `asChild` (docs/blocks-feedback.md, 15).
    <Box asChild display="flex" flexDirection="column" gap={4}>
      {/* A click on empty Board space clears the selection, a pointer
          shortcut: Escape and the bar's Clear button do it by keyboard. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: see above */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: see above */}
      <div onClick={clearOnEmptyClick}>
        {error && <Alert intent="error">{error}</Alert>}
        <DndProvider
          sensors={sensors}
          plugins={plugins}
          onDragStart={() => {
            dragging.current = true;
          }}
          onDragOver={rememberDropTarget}
          onDragEnd={finishDrag}
        >
          <EpicChips
            epics={rowEpics}
            projectId={project.id}
            cycleId={cycleId ?? undefined}
            boardPath={boardPath}
            hideDone={typeof cycleId !== 'number'}
          />
          <Grid gap={3}>
            {statuses.map((status) => (
              <GridItem key={status} colSpan={[12, 4]}>
                <StatusColumn
                  projectId={project.id}
                  cycleId={cycleId}
                  boardPath={boardPath}
                  status={status}
                  tickets={laneOf(status)}
                  selected={selectedOnBoard}
                  onSelect={select}
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
                <CycleRefusals
                  heading={cycleRefusals?.heading ?? ''}
                  refusals={shownRefusals}
                />
              )
            }
          >
            {typeof cycleId === 'number' ? (
              <Button
                type="button"
                variant="ghost"
                size="small"
                disabled={changingCycle}
                onClick={() =>
                  changeSelectionCycle(unplanTickets, cycleId, 'Not removed')
                }
              >
                Remove from Cycle
              </Button>
            ) : (
              plannable.length > 0 && (
                <PlanIntoCycleMenu
                  cycles={plannable}
                  disabled={changingCycle}
                  onPick={(cycle) =>
                    changeSelectionCycle(planTickets, cycle.id, 'Not planned')
                  }
                />
              )
            )}
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
            onChange={setShowArchived}
          />
          <Label htmlFor={switchId}>Show archived ({archived.length})</Label>
        </Inline>
        {showArchived && (
          <ArchivedTickets tickets={archived} boardPath={boardPath} />
        )}
      </div>
    </Box>
  );
};
