'use client';

import {
  Box,
  Heading,
  Inline,
  Link,
  Progress,
  Stack,
  Tag,
  Text,
} from '@blockle/blocks';
import type { FC, ReactNode } from 'react';

import { modeColors } from '../../app/lib/mode-colors';
import { cockpitPath, ticketOnBoardPath } from '../../app/lib/paths';
import type { Cycle } from '../../tickets/cycles';
import type { Ticket } from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import type { InProgressSection } from '../board/board-lanes';
import {
  useLiveConversations,
  useTicketCosts,
} from '../conversation-activity/conversation-activity';
import { formatCost } from '../conversation-labels/conversation-labels';
import { Icon, type IconName } from '../icon/icon';
import { tinted } from '../palette/palette.css';
import { formatElapsed } from '../status-line/format-elapsed';
import { useNow } from '../status-line/use-now';
import * as styles from './cockpit.css';
import { type CockpitTicket, cockpitOf, type InFlightRow } from './cockpit-of';

export type CockpitProps = {
  projectId: number;
  /** The Cycle shown, the Project's Active one. */
  cycle: Pick<Cycle, 'title'>;
  /** The Cycle's Tickets, as its Board gets them. */
  tickets: Ticket[];
  /** The Project's Start runs working now, and how many it allows at once. */
  runSlots: { used: number; cap: number };
};

const sectionIntent = {
  Running: 'primary',
  'Action needed': 'warning',
  Review: 'info',
} as const satisfies Record<InProgressSection, string>;

/** What an In progress Ticket without a live Conversation is waiting on. */
const parkedLine: Record<InProgressSection, string> = {
  Running: 'Claimed, no live run',
  Review: 'PR open',
  'Action needed': 'Stalled: no Claim and no PR',
};

/** A pull request's number from its GitHub URL, such as `#87`. */
const pullRequestLabel = (url: string) =>
  `PR #${new URL(url).pathname.split('/')[4]}`;

type TicketRowProps = {
  ticket: CockpitTicket;
  href: string;
  icon: IconName;
  /** The second line: what the Ticket is doing or where it stands. */
  line: string;
  /** Greyed out, for work that does not need the User now. */
  muted?: boolean;
  end?: ReactNode;
};

/** One Ticket as a row: the same shape in every list of the Cockpit. */
const TicketRow: FC<TicketRowProps> = ({
  ticket,
  href,
  icon,
  line,
  muted = false,
  end,
}) => (
  <Box
    asChild
    paddingBlock={2}
    paddingInline={3}
    borderRadius={2}
    backgroundColor={muted ? modeColors.sunken : modeColors.raised}
    boxShadow={muted ? undefined : 1}
    className={ticket.epic ? styles.epicEdge[ticket.epic.color] : styles.edge}
  >
    <li>
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
            </Inline>
            <Text truncate fontSize="small" color="muted">
              {line}
            </Text>
          </Stack>
        </Inline>
        {end}
      </Inline>
    </li>
  </Box>
);

type ListProps = { title: string; count: number; children: ReactNode };

/** A list of work that does not need the User now: closed until opened. */
const ClosedList: FC<ListProps> = ({ title, count, children }) => (
  <Box asChild>
    <section aria-label={title}>
      <details>
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

/** An In flight row's second line: its live line and run time, or why it waits. */
function inFlightLine(row: InFlightRow, now: number): string {
  const parts = row.live
    ? [row.live.line, formatElapsed(now - new Date(row.live.since).getTime())]
    : [parkedLine[row.section]];
  return [...parts, ...(row.cost > 0 ? [formatCost(row.cost)] : [])].join(
    ' · ',
  );
}

/**
 * A Project's Cockpit: its Active Cycle in one column, by what needs the
 * User first. The header shows the Cycle's progress and the Start runs
 * working; In flight shows each In progress Ticket with what its run is
 * doing; Your work, Queued and Done stay closed until opened. Every row's
 * title opens its Ticket in a drawer over the Cockpit. It follows live
 * Conversations as the Board does.
 */
export const Cockpit: FC<CockpitProps> = ({
  projectId,
  cycle,
  tickets,
  runSlots,
}) => {
  const live = useLiveConversations();
  const cost = useTicketCosts();
  const now = useNow();
  const cockpit = cockpitOf(tickets, { live, cost });
  const hrefOf = (number: number) =>
    ticketOnBoardPath(cockpitPath(projectId), number);
  const age = (date: Date) => formatElapsed(now - date.getTime());
  const { done, total } = cockpit.progress;

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Inline gap={3} alignY="center" alignX="between">
          <Inline gap={2} alignY="center">
            <Heading level={2}>Cockpit</Heading>
            <Text color="muted">
              {cycle.title} · {done}/{total} done
            </Text>
          </Inline>
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
        <section aria-label="In flight">
          <Inline gap={2} alignY="center">
            <Heading level={3}>In flight</Heading>
            <Tag>{cockpit.inFlight.length}</Tag>
          </Inline>
          {cockpit.inFlight.length === 0 ? (
            <Text color="muted">Nothing in flight.</Text>
          ) : (
            <Stack gap={1} listStyle="none" role="list" asChild>
              <ul>
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
                          <Text fontSize="small">
                            <Link
                              href={row.pullRequest}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {pullRequestLabel(row.pullRequest)}
                            </Link>
                          </Text>
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
        <ClosedList title="Your work" count={cockpit.yourWork.length}>
          {cockpit.yourWork.map((row) => (
            <TicketRow
              key={row.number}
              muted
              ticket={row}
              href={hrefOf(row.number)}
              icon="user"
              line={`ready-for-human · for ${age(row.updatedAt)}`}
              end={<Tag>For human</Tag>}
            />
          ))}
        </ClosedList>
        <ClosedList title="Queued" count={cockpit.queued.length}>
          {cockpit.queued.map((row, index) => (
            <TicketRow
              key={row.number}
              muted
              ticket={row}
              href={hrefOf(row.number)}
              icon="clock"
              line={[
                `Queued #${index + 1}`,
                ...(row.blocked
                  ? [
                      row.blockers.length > 0
                        ? `blocked by ${row.blockers.map((number) => `T${number}`).join(', ')}`
                        : 'blocked',
                    ]
                  : []),
              ].join(' · ')}
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
        </ClosedList>
        <ClosedList title="Done" count={cockpit.done.length}>
          {cockpit.done.map((row) => (
            <TicketRow
              key={row.number}
              muted
              ticket={row}
              href={hrefOf(row.number)}
              icon="check-circle"
              line={[
                `Done ${age(row.updatedAt)} ago`,
                ...(row.pullRequest ? [pullRequestLabel(row.pullRequest)] : []),
                ...(row.cost > 0 ? [formatCost(row.cost)] : []),
              ].join(' · ')}
              end={<Tag intent="success">Done</Tag>}
            />
          ))}
        </ClosedList>
      </Stack>
    </Stack>
  );
};
