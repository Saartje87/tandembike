'use client';

import {
  Alert,
  Box,
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
  DragDropProvider as DndProvider,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import {
  type FC,
  type ReactNode,
  type Ref,
  startTransition,
  useEffect,
  useOptimistic,
  useState,
} from 'react';

import { modeColors } from '../../app/lib/mode-colors';
import { cyclePath, ticketOnBoardPath } from '../../app/lib/paths';
import { reorderTickets } from '../../app/tickets/actions';
import type { Cycle } from '../../tickets/cycles';
import type { Ticket } from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import { mergeLaneOrder } from '../board/board-filter';
import type { InProgressSection } from '../board/board-lanes';
import {
  useLiveConversations,
  useTicketCosts,
} from '../conversation-activity/conversation-activity';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import { formatCost } from '../conversation-labels/conversation-labels';
import { Icon, type IconName } from '../icon/icon';
import { tinted } from '../palette/palette.css';
import { formatElapsed } from '../status-line/format-elapsed';
import { useNow } from '../status-line/use-now';
import * as styles from './cockpit.css';
import {
  type CockpitTicket,
  cockpitOf,
  type EpicChildState,
  type EpicRow,
  type InFlightRow,
  type NeedKind,
  type NeedRow,
  type QueuedRow,
} from './cockpit-of';

export type CockpitProps = {
  projectId: number;
  /** The Cycle shown, the Project's Active one. */
  cycle: Pick<Cycle, 'id' | 'title'>;
  /** The Cycle's Tickets, as its Board gets them. */
  tickets: Ticket[];
  /**
   * The Backlog's Tickets: their Intake also needs the User, since runs file
   * their feedback outside any Cycle. Defaults to none.
   */
  backlog?: Ticket[];
  /** The Project's Start runs working now, and how many it allows at once. */
  runSlots: { used: number; cap: number };
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

/** A queued row's second line: its place, and what blocks it. */
function queuedLine(row: QueuedRow, index: number): string {
  const blockedBy =
    row.blockers.length > 0
      ? `blocked by ${row.blockers.map((number) => `T${number}`).join(', ')}`
      : 'blocked';
  return lineOf(`Queued #${index + 1}`, row.blocked && blockedBy);
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
  ticket: CockpitTicket;
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
};

/**
 * One Ticket as a row: the same shape in every list of the Cockpit, edged in
 * its Epic's colour, or its own for an Epic. With `details`, the row opens
 * and closes on itself to show them.
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
}) => {
  const color = ticket.epic?.color ?? ticket.color;
  const content = (
    <Inline gap={3} alignY="center" alignX="between">
      <Inline gap={2} alignY="center" minInlineSize={0} flex={1}>
        <Icon
          name={icon}
          size="small"
          color={muted ? modeColors.textMuted : undefined}
        />
        <Text fontFamily="mono" fontSize="small" color="muted">
          T{ticket.number}
        </Text>
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
      {end}
    </Inline>
  );
  return (
    <Box
      asChild
      paddingBlock={2}
      paddingInline={3}
      borderRadius={2}
      backgroundColor={muted ? modeColors.sunken : modeColors.raised}
      boxShadow={muted ? undefined : 1}
      className={color ? styles.epicEdge[color] : styles.edge}
    >
      <li
        ref={rowRef}
        // dnd-kit makes a row it drags a button unless it has a role; it
        // stays a list item, with the drag in its role description.
        // biome-ignore lint/a11y/noRedundantRoles: see above
        role={rowRef ? 'listitem' : undefined}
        // Focusable from the first render when it can be dragged, so Space
        // picks it up; dnd-kit would add this only on a later frame.
        tabIndex={rowRef ? 0 : undefined}
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

const sectionOf = (
  item: { data: Record<string, unknown> } | null | undefined,
) => item?.data.section;

const childStateLabel: Record<EpicChildState, string> = {
  done: 'done',
  running: 'running',
  'needs-you': 'needs you',
  review: 'in review',
  queued: 'queued',
};

type PipProps = { state: EpicChildState; title?: string };

/** One child's mark in an Epic's children bar, coloured by its state. */
const Pip: FC<PipProps> = ({ state, title }) => (
  <span title={title} className={`${styles.pip} ${styles.pipState[state]}`} />
);

type ChildrenBarProps = { row: EpicRow };

/** An Epic's children as one mark each, coloured by where it stands. */
const ChildrenBar: FC<ChildrenBarProps> = ({ row }) => {
  const done = row.children.filter(({ state }) => state === 'done').length;
  return (
    <Inline
      gap={1}
      alignY="center"
      flexWrap="nowrap"
      role="img"
      aria-label={`${done} of ${row.children.length} children done`}
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

type EpicChildListProps = { row: EpicRow };

/** An opened Epic row: each child with where it stands. */
const EpicChildList: FC<EpicChildListProps> = ({ row }) => (
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
            <Text fontSize="small">{child.title}</Text>
            <Text fontSize="small" color="muted">
              {childStateLabel[child.state]}
            </Text>
          </Inline>
        </li>
      ))}
    </ul>
  </Stack>
);

type RowListProps = {
  title: string;
  count: number;
  /** Open at first; the User opens and closes it on its heading. */
  open?: boolean;
  children: ReactNode;
};

/** A titled list of rows that opens and closes on its heading. */
const RowList: FC<RowListProps> = ({
  title,
  count,
  open = false,
  children,
}) => (
  <Box asChild>
    <section aria-label={title}>
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

/**
 * An In flight row's second line: its live line and run time, or, for a
 * claimed Ticket with no live run (such as one worked in a terminal), that.
 */
function inFlightLine(row: InFlightRow, now: number): string {
  const cost = row.cost > 0 && formatCost(row.cost);
  return row.live
    ? lineOf(
        row.live.line,
        formatElapsed(now - new Date(row.live.since).getTime()),
        cost,
      )
    : lineOf('Claimed, no live run', cost);
}

/**
 * A Project's Cockpit: its Active Cycle in one column, by what needs the
 * User first. The header shows the Cycle's progress and the Start runs
 * working; Needs you shows what waits on the User (Action needed, Review,
 * then Intake from the Cycle and the Backlog), in groups that start open,
 * longest waiting first; In flight shows each Running Ticket with what
 * its run is doing; Your work, Queued and Done stay closed until opened.
 * Its lists offer no actions: every row's title opens its Ticket in a
 * drawer over the Cockpit. The browser tab's title carries the Needs you
 * count. It follows live Conversations as the Board does.
 */
export const Cockpit: FC<CockpitProps> = ({
  projectId,
  cycle,
  tickets,
  backlog = [],
  runSlots,
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
  const [error, setError] = useState<string>();
  const cockpit = cockpitOf(shownTickets, { live, cost }, backlog);
  const backlogNumbers = new Set(backlog.map(({ number }) => number));
  const hrefOf = (number: number) =>
    ticketOnBoardPath(cyclePath(projectId, cycle.id), number);
  const age = (date: Date) => formatElapsed(now - date.getTime());
  const { done, total } = cockpit.progress;
  const { needsYou } = cockpit;
  const inFlightCount = cockpit.epics.length + cockpit.inFlight.length;
  useCountInTitle(needsYou.count);

  /** The Todo Tickets this Cycle orders, over all three sections, in order. */
  const todoLane = shownTickets
    .filter(
      (ticket) =>
        ticket.status === 'Todo' &&
        !ticket.archived &&
        (ticket.type !== 'Epic' || ticket.cycle?.id === cycle.id),
    )
    .sort(
      (left, right) =>
        left.position - right.position || left.number - right.number,
    )
    .map(({ number }) => number);
  /** The rows of a section that a drag orders, in the order shown. */
  const sectionNumbers: Record<ReorderSection, number[]> = {
    Queued: cockpit.queued.map(({ number }) => number),
    'Your work': cockpit.yourWork.map(({ number }) => number),
    Intake: needsYou.intake
      .filter(({ number }) => !backlogNumbers.has(number))
      .map(({ number }) => number),
  };

  const sortableIn = (
    section: ReorderSection,
    number: number,
  ): Sortable | undefined => {
    const index = sectionNumbers[section].indexOf(number);
    return index < 0 ? undefined : { section, index };
  };

  const followDrag = (event: DragOverEvent) => {
    const { source, target } = event.operation;
    // dnd-kit would move the row's element into the other section's list,
    // which React then fails to remove from its own list on the drop.
    if (target && sectionOf(target) !== sectionOf(source)) {
      event.preventDefault();
    }
  };

  const finishDrag = (event: DragEndEvent) => {
    const { source, target } = event.operation;
    if (event.canceled || !isSortable(source)) {
      return;
    }
    const section = sectionOf(source) as ReorderSection;
    // A drop in another section changes nothing.
    if (sectionOf(target) !== section) {
      return;
    }
    const numbers = sectionNumbers[section];
    const from = numbers.indexOf(Number(source.id));
    // Over its own slot, the row is where dnd-kit's sorting moved it; over
    // another row, it takes that row's place.
    const to =
      target?.id === source.id
        ? source.index
        : numbers.indexOf(Number(target?.id));
    if (from < 0 || to < 0 || from === to) {
      return;
    }
    const moved = [...numbers];
    moved.splice(from, 1);
    moved.splice(to, 0, numbers[from]);
    // The Todo Tickets of the other sections keep their places around it.
    const ticketNumbers = mergeLaneOrder(todoLane, moved, [numbers[from]]);
    setError(undefined);
    startTransition(async () => {
      showOrder(ticketNumbers);
      const result = await reorderTickets({
        projectId,
        status: 'Todo',
        cycleId: cycle.id,
        ticketNumbers,
      });
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  const needRows = (rows: NeedRow[]) =>
    rows.map((row) => (
      <DraggableTicketRow
        key={row.number}
        sortable={sortableIn('Intake', row.number)}
        ticket={row}
        href={hrefOf(row.number)}
        icon={needDisplay[row.kind].icon}
        line={needLine(row, age(row.since))}
        end={
          <Inline gap={2} alignY="center" flexWrap="nowrap">
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
      onDragOver={followDrag}
      onDragEnd={finishDrag}
    >
      <Stack gap={6}>
        {error && <Alert intent="danger">{error}</Alert>}
        <Stack gap={2}>
          <Inline gap={3} alignY="center" alignX="between">
            <Text color="muted">
              {done}/{total} done
            </Text>
            <Tag startSlot={<Icon name="cpu-chip" size="small" />}>
              Runs {runSlots.used}/{runSlots.cap}
            </Tag>
          </Inline>
          <Progress
            value={total === 0 ? 0 : Math.round((done / total) * 100)}
            aria-label="Cycle progress"
          />
        </Stack>
        <Stack gap={2} asChild>
          <section aria-label="Needs you">
            <Inline gap={2} alignY="center">
              <Heading level={3}>Needs you</Heading>
              <Tag>{needsYou.count}</Tag>
            </Inline>
            {needsYou.count === 0 ? (
              <Text color="muted">Nothing needs you.</Text>
            ) : (
              <Stack gap={3}>
                {needsYou.actionNeeded.length > 0 && (
                  <RowList
                    title="Action needed"
                    count={needsYou.actionNeeded.length}
                    open
                  >
                    {needRows(needsYou.actionNeeded)}
                  </RowList>
                )}
                {needsYou.review.length > 0 && (
                  <RowList title="Review" count={needsYou.review.length} open>
                    {needRows(needsYou.review)}
                  </RowList>
                )}
                {needsYou.intake.length > 0 && (
                  <RowList title="Intake" count={needsYou.intake.length} open>
                    {needRows(needsYou.intake)}
                  </RowList>
                )}
              </Stack>
            )}
          </section>
        </Stack>
        <Stack gap={2} asChild>
          <section aria-label="In flight">
            <Inline gap={2} alignY="center">
              <Heading level={3}>In flight</Heading>
              <Tag>{inFlightCount}</Tag>
            </Inline>
            {inFlightCount === 0 ? (
              <Text color="muted">Nothing in flight.</Text>
            ) : (
              <Stack gap={1} listStyle="none" role="list" asChild>
                <ul>
                  {cockpit.epics.map((row) => (
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
                              startSlot={<Icon name="arrow-up" size="small" />}
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
                      details={<EpicChildList row={row} />}
                    />
                  ))}
                  {cockpit.inFlight.map((row) => (
                    <TicketRow
                      key={row.number}
                      ticket={row}
                      href={hrefOf(row.number)}
                      icon="play"
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
        <Stack gap={2}>
          <RowList title="Your work" count={cockpit.yourWork.length}>
            {cockpit.yourWork.map((row) => (
              <DraggableTicketRow
                key={row.number}
                sortable={sortableIn('Your work', row.number)}
                muted
                ticket={row}
                href={hrefOf(row.number)}
                icon="user"
                line={`ready-for-human · for ${age(row.updatedAt)}`}
                end={<Tag>For human</Tag>}
              />
            ))}
          </RowList>
          <RowList title="Queued" count={cockpit.queued.length}>
            {cockpit.queued.map((row, index) => (
              <DraggableTicketRow
                key={row.number}
                sortable={sortableIn('Queued', row.number)}
                muted
                ticket={row}
                href={hrefOf(row.number)}
                icon="clock"
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
          <RowList title="Done" count={cockpit.done.length}>
            {cockpit.done.map((row) => (
              <TicketRow
                key={row.number}
                muted
                ticket={row}
                href={hrefOf(row.number)}
                icon="check-circle"
                line={lineOf(
                  `Done ${age(row.updatedAt)} ago`,
                  row.pullRequest && pullRequestLabel(row.pullRequest),
                  row.cost > 0 && formatCost(row.cost),
                )}
                end={<Tag intent="success">Done</Tag>}
              />
            ))}
          </RowList>
        </Stack>
      </Stack>
    </DndProvider>
  );
};
