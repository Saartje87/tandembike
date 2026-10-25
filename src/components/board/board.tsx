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
  type ReactNode,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react';

import { boardPathOf, ticketOnBoardPath } from '../../app/lib/paths';
import {
  attachTicketToEpic,
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
import { TicketCard } from '../ticket-card/ticket-card';
import * as styles from './board.css';

export type BoardProps = {
  project: Project;
  /**
   * The Board's Tickets, archived ones included, oldest-created first. Its
   * Epics stay out of the columns.
   */
  tickets: Ticket[];
  /**
   * The Project's live Epics, oldest-created first, for the row above the
   * columns; a Cycle's Board lists only those with a child in `tickets`.
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
};

const SortableTicketCard: FC<SortableTicketCardProps> = ({
  ticket,
  index,
  boardPath,
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
  | { number: number; epic: EpicLink };

const applyBoardChange = (tickets: Ticket[], change: BoardChange) => {
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

/**
 * A Project's Board: its header, its Epics' row, and one column per Status
 * holding its active normal Tickets, plus a
 * "Show archived" switch, with their count, that lists archived Tickets
 * below. Tickets can be reordered by dragging or moved between Statuses; both
 * changes save through Server Actions and roll back optimistically if
 * refused.
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
  const switchId = useId();
  const active = shownTickets.filter(
    (ticket) => !ticket.archived && ticket.type !== 'Epic',
  );
  const planned = new Set(tickets.map((ticket) => ticket.number));
  const rowEpics =
    typeof cycleId === 'number'
      ? shownEpics.filter((epic) =>
          epic.children.some((child) => planned.has(child.number)),
        )
      : shownEpics;
  const archived = shownTickets.filter((ticket) => ticket.archived);

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
  };

  const finishDrag = (event: DragEndEvent) => {
    const sourceId = event.operation.source?.id;
    const operationTargetId = event.operation.target?.id;
    const targetId =
      sourceId === operationTargetId && lastDropTarget.current !== undefined
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
    <Stack gap={4}>
      <ProjectHeader project={project}>{header}</ProjectHeader>
      {error && <Alert intent="error">{error}</Alert>}
      <DndProvider onDragOver={rememberDropTarget} onDragEnd={finishDrag}>
        <EpicChips
          epics={rowEpics}
          projectId={project.id}
          cycleId={cycleId ?? undefined}
          boardPath={boardPath}
        />
        <Grid gap={3}>
          {statuses.map((status) => (
            <GridItem key={status} colSpan={[12, 4]}>
              <StatusColumn
                projectId={project.id}
                cycleId={cycleId}
                boardPath={boardPath}
                status={status}
                tickets={active
                  .filter((ticket) => ticket.status === status)
                  .sort(
                    (left, right) =>
                      left.position - right.position ||
                      left.number - right.number,
                  )}
              />
            </GridItem>
          ))}
        </Grid>
      </DndProvider>
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
    </Stack>
  );
};
