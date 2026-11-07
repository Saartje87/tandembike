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
  type FC,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from 'react';

import { moveTicketsToCycle } from '../../app/cycles/actions';
import { modeColors } from '../../app/lib/mode-colors';
import { cyclePath, ticketOnBoardPath } from '../../app/lib/paths';
import { archiveTickets, moveTicketsToEpic } from '../../app/tickets/actions';
import type { Cycle } from '../../tickets/cycles';
import type { BatchFailure } from '../../tickets/errors';
import type { Ticket } from '../../tickets/tickets';
import { AddToEpicMenu } from '../add-to-epic-menu/add-to-epic-menu';
import { AppLink } from '../app-link/app-link';
import type { InProgressSection } from '../board/board-lanes';
import {
  useLiveConversations,
  useTicketCosts,
} from '../conversation-activity/conversation-activity';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import { formatCost } from '../conversation-labels/conversation-labels';
import { Icon, type IconName } from '../icon/icon';
import { MoveToCycleMenu } from '../move-to-cycle-menu/move-to-cycle-menu';
import { tinted } from '../palette/palette.css';
import { SelectionBar } from '../selection-bar/selection-bar';
import { formatElapsed } from '../status-line/format-elapsed';
import { useNow } from '../status-line/use-now';
import {
  isSelectClick,
  type SelectMode,
  selectModeOf,
} from '../ticket-card/ticket-card';
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
  /** The Project's Cycles, for the selection bar's Move to Cycle. Defaults to none. */
  cycles?: Cycle[];
  /** The Project's live Epics, for the selection bar's Add to Epic. Defaults to none. */
  epics?: Pick<Ticket, 'number' | 'title'>[];
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
  /** Makes the row selectable: whether it is, and how a select gesture lands. */
  selection?: { selected: boolean; onSelect: (mode: SelectMode) => void };
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
  selection,
}) => {
  const color = ticket.epic?.color ?? ticket.color;
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
    <Inline gap={3} alignY="center" alignX="between">
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
      {/* Keyboard users select with the checkbox. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: a modifier-click shortcut */}
      <li onClick={selectByClick}>
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
 *
 * Rows can be selected with their checkbox, Cmd-click or Ctrl-click, or a
 * Shift-click range within one list; a bar then moves the selection to
 * another Cycle or the Backlog, adds it to an Epic, or archives it. The
 * Tickets an action refuses stay selected, with the reason. Epic rows
 * cannot be selected.
 */
export const Cockpit: FC<CockpitProps> = ({
  projectId,
  cycle,
  tickets,
  backlog = [],
  runSlots,
  cycles = [],
  epics = [],
}) => {
  const live = useLiveConversations();
  const cost = useTicketCosts();
  const now = useNow();
  const cockpit = cockpitOf(tickets, { live, cost }, backlog);
  const hrefOf = (number: number) =>
    ticketOnBoardPath(cyclePath(projectId, cycle.id), number);
  const age = (date: Date) => formatElapsed(now - date.getTime());
  const { done, total } = cockpit.progress;
  const { needsYou } = cockpit;
  const inFlightCount = cockpit.epics.length + cockpit.inFlight.length;
  useCountInTitle(needsYou.count);

  // The rows that can be selected, by list, in the order shown.
  const lists: Record<string, number[]> = {
    actionNeeded: needsYou.actionNeeded.map(({ number }) => number),
    review: needsYou.review.map(({ number }) => number),
    intake: needsYou.intake.map(({ number }) => number),
    inFlight: cockpit.inFlight.map(({ number }) => number),
    yourWork: cockpit.yourWork.map(({ number }) => number),
    queued: cockpit.queued.map(({ number }) => number),
    done: cockpit.done.map(({ number }) => number),
  };
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const anchor = useRef<{ number: number; list: string } | undefined>(
    undefined,
  );
  const [refusals, setRefusals] = useState<BatchFailure[]>();
  const [error, setError] = useState<string>();
  const [changing, startChange] = useTransition();
  // Tickets that left the lists drop out of the selection.
  const selection = Object.values(lists)
    .flat()
    .filter((number) => picked.has(number));
  const shownRefusals = refusals?.filter(({ number }) =>
    selection.includes(number),
  );
  const clearSelection = useCallback(() => {
    setPicked(new Set());
    setRefusals(undefined);
    setError(undefined);
    anchor.current = undefined;
  }, []);
  const hasSelection = picked.size > 0;
  useEffect(() => {
    if (!hasSelection) {
      return;
    }
    const clearOnEscape = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !(
          event.target instanceof Element &&
          event.target.closest(
            'input:not([type="checkbox"]), textarea, select, dialog, [role="dialog"]',
          )
        )
      ) {
        clearSelection();
      }
    };
    document.addEventListener('keydown', clearOnEscape);
    return () => document.removeEventListener('keydown', clearOnEscape);
  }, [hasSelection, clearSelection]);
  const select = (number: number, list: string, mode: SelectMode) => {
    setRefusals(undefined);
    setError(undefined);
    const numbers = lists[list] ?? [];
    const from =
      mode === 'range' && anchor.current?.list === list
        ? numbers.indexOf(anchor.current.number)
        : -1;
    if (from >= 0) {
      const to = numbers.indexOf(number);
      const range = numbers.slice(Math.min(from, to), Math.max(from, to) + 1);
      setPicked((current) => new Set([...current, ...range]));
      return;
    }
    anchor.current = { number, list };
    setPicked((current) => {
      const next = new Set(current);
      if (mode === 'toggle' && next.has(number)) {
        next.delete(number);
      } else {
        next.add(number);
      }
      return next;
    });
  };
  const selectable = (number: number, list: string) => ({
    selected: picked.has(number),
    onSelect: (mode: SelectMode) => select(number, list, mode),
  });
  const moveSelectionToCycle = (cycleId: number | null) => {
    const numbers = selection;
    setError(undefined);
    setRefusals(undefined);
    startChange(async () => {
      const result = await moveTicketsToCycle({
        projectId,
        cycleId,
        ticketNumbers: numbers,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const refused = new Set(result.failed.map(({ number }) => number));
      // Only the moved Tickets leave: rows picked meanwhile stay selected.
      setPicked(
        (current) =>
          new Set(
            [...current].filter(
              (number) => !numbers.includes(number) || refused.has(number),
            ),
          ),
      );
      if (result.failed.length > 0) {
        setRefusals(result.failed);
      }
    });
  };
  const addSelectionToEpic = (epic: number) => {
    const numbers = selection;
    setError(undefined);
    setRefusals(undefined);
    startChange(async () => {
      const result = await moveTicketsToEpic({ epic, children: numbers });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPicked(
        (current) =>
          new Set([...current].filter((number) => !numbers.includes(number))),
      );
    });
  };
  const archiveSelection = () => {
    const numbers = selection;
    setError(undefined);
    setRefusals(undefined);
    startChange(async () => {
      const result = await archiveTickets({ ticketNumbers: numbers });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPicked(
        (current) =>
          new Set([...current].filter((number) => !numbers.includes(number))),
      );
    });
  };
  const needRows = (rows: NeedRow[], list: string) =>
    rows.map((row) => (
      <TicketRow
        key={row.number}
        ticket={row}
        href={hrefOf(row.number)}
        icon={needDisplay[row.kind].icon}
        line={needLine(row, age(row.since))}
        selection={selectable(row.number, list)}
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
                  {needRows(needsYou.actionNeeded, 'actionNeeded')}
                </RowList>
              )}
              {needsYou.review.length > 0 && (
                <RowList title="Review" count={needsYou.review.length} open>
                  {needRows(needsYou.review, 'review')}
                </RowList>
              )}
              {needsYou.intake.length > 0 && (
                <RowList title="Intake" count={needsYou.intake.length} open>
                  {needRows(needsYou.intake, 'intake')}
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
      <Stack gap={2}>
        <RowList title="Your work" count={cockpit.yourWork.length}>
          {cockpit.yourWork.map((row) => (
            <TicketRow
              key={row.number}
              muted
              ticket={row}
              href={hrefOf(row.number)}
              icon="user"
              selection={selectable(row.number, 'yourWork')}
              line={`ready-for-human · for ${age(row.updatedAt)}`}
              end={<Tag>For human</Tag>}
            />
          ))}
        </RowList>
        <RowList title="Queued" count={cockpit.queued.length}>
          {cockpit.queued.map((row, index) => (
            <TicketRow
              key={row.number}
              muted
              ticket={row}
              href={hrefOf(row.number)}
              icon="clock"
              selection={selectable(row.number, 'queued')}
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
              selection={selectable(row.number, 'done')}
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
      {selection.length > 0 && (
        <SelectionBar
          count={selection.length}
          onClear={clearSelection}
          notice={
            shownRefusals &&
            shownRefusals.length > 0 && <NotMoved refusals={shownRefusals} />
          }
        >
          <MoveToCycleMenu
            cycles={cycles}
            cycleId={cycle.id}
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
  );
};
