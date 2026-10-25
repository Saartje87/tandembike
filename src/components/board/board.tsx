'use client';

import {
  Alert,
  Box,
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
  DragDropProvider as DndProvider,
  type DragEndEvent,
  type DragOverEvent,
  useDroppable,
} from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import {
  type FC,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react';

import { boardPathOf, ticketOnBoardPath } from '../../app/lib/paths';
import {
  attachTicketToEpic,
  moveTickets,
  reorderTickets,
  updateTicket,
} from '../../app/tickets/actions';
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
import { ProjectHeader } from '../project-header/project-header';
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
  /** Shown under the Project's name: its tabs, and a Cycle's header. */
  header?: ReactNode;
  /**
   * The tab the Board shows: a Cycle by id, whose new Tickets are planned
   * into it, or `null` for the Backlog. Lanes are reordered within it.
   * Defaults to the whole Project.
   */
  cycleId?: number | null;
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
  const { ref, handleRef } = useSortable({
    id: ticket.number,
    index,
    group: ticket.status,
    collisionPriority: 3,
  });

  return (
    <TicketCard
      ticket={ticket}
      boardPath={boardPath}
      cardRef={ref}
      dragHandleRef={handleRef}
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
                  #{ticket.number}
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
  | { number: number; epic: EpicLink };

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
  if ('epic' in change) {
    return tickets.map((ticket) =>
      ticket.number === change.number
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

type EpicJoin = { child: Ticket; epicNumber: number };

/** `epics` with `child` taken out of its Epic and into Epic `epicNumber`. */
const applyEpicJoin = (epics: Ticket[], { child, epicNumber }: EpicJoin) =>
  epics.map((epic) => {
    const children = epic.children.filter(
      (candidate) => candidate.number !== child.number,
    );
    if (epic.number === epicNumber) {
      const { number, title, status, archived, blockedBy, blocked } = child;
      children.push({ number, title, status, archived, blockedBy, blocked });
    }
    return { ...epic, children };
  });

/** Clicks inside these are not on empty Board space. */
const notEmptySpaceSelector =
  'a, button, input, textarea, select, label, form, li, [role="toolbar"], dialog, [role="dialog"]';

/** Where Escape belongs to the control, not to the selection. */
const escapeOwnerSelector =
  'input:not([type="checkbox"]), textarea, select, dialog, [role="dialog"]';

/**
 * A Project's Board: its header, its Epics' row, and one column per Status
 * holding its active normal Tickets, plus a
 * "Show archived" switch, with their count, that lists archived Tickets
 * below. Tickets can be reordered by dragging or moved between Statuses; both
 * changes save through Server Actions and roll back optimistically if
 * refused.
 *
 * Cards can be selected with Cmd-click or Ctrl-click, a Shift-click range in
 * one column, or their checkboxes; a bar then shows the selection. Dragging
 * a selected card moves the whole selection. The selection lives only in
 * this tab and drops Tickets that leave the Board.
 */
export const Board: FC<BoardProps> = ({
  project,
  tickets,
  epics = [],
  openTicket,
  header,
  cycleId,
}) => {
  const boardPath = boardPathOf(project.id, cycleId ?? null);
  const [shownTickets, showChange] = useOptimistic(tickets, applyBoardChange);
  const [shownEpics, showEpicJoin] = useOptimistic(epics, applyEpicJoin);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();
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
  if (selectedOnBoard.size < selected.size) {
    // A Ticket that left the Board drops out, so it is not selected if it
    // comes back.
    setSelected(selectedOnBoard);
  }
  const clearSelection = useCallback(() => {
    setSelected(new Set());
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

  const joinEpic = (ticket: Ticket, epicNumber: number) => {
    const epic = shownEpics.find(({ number }) => number === epicNumber);
    if (!epic || ticket.epic?.number === epicNumber) {
      return;
    }
    setError(undefined);
    startTransition(async () => {
      showChange({
        number: ticket.number,
        epic: epicLinkOf(epic),
      });
      showEpicJoin({ child: ticket, epicNumber });
      const result = await attachTicketToEpic({
        epic: epicNumber,
        child: ticket.number,
      });
      if (!result.ok) {
        setError(result.error);
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
    const epicNumber = epicOfDropTarget(targetId);
    if (epicNumber !== undefined) {
      joinEpic(ticket, epicNumber);
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
    if (selectedOnBoard.has(sourceId) && selection.length > 1) {
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
        <ProjectHeader project={project}>{header}</ProjectHeader>
        {error && <Alert intent="error">{error}</Alert>}
        <DndProvider
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
          <SelectionBar count={selection.length} onClear={clearSelection} />
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
