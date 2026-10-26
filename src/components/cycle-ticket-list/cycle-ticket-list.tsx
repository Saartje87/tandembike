import { Inline, Stack, Text } from '@blockle/blocks';
import type { FC } from 'react';

import {
  cyclePath,
  ticketByNumberPath,
  ticketOnBoardPath,
} from '../../app/lib/paths';
import type { Cycle } from '../../tickets/cycles';
import type { Ticket } from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import * as styles from './cycle-ticket-list.css';

export type CycleTicketListProps = {
  /** The archived Cycle shown. */
  cycle: Pick<Cycle, 'id' | 'projectId'>;
  /** Its final Tickets, archived ones included. */
  tickets: Ticket[];
};

/**
 * An archived Cycle's Tickets, read-only: each with its number, a link that
 * opens it in the drawer, and its Status now. A Ticket still in the Cycle's
 * Project opens over the Cycle, so the User stays there; one moved to
 * another Project since opens over its own Board.
 */
export const CycleTicketList: FC<CycleTicketListProps> = ({
  cycle,
  tickets,
}) =>
  tickets.length === 0 ? (
    <Text tag="p" color="text-600">
      No Tickets in this Cycle
    </Text>
  ) : (
    <Stack
      tag="ul"
      gap={2}
      className={styles.ticketList}
      aria-label="Tickets in this Cycle"
    >
      {tickets.map((ticket) => {
        const stillHere = ticket.projectId === cycle.projectId;
        return (
          <li key={ticket.number}>
            <Inline gap={2} alignY="center">
              <Text color="text-600" fontSize="small">
                T{ticket.number}
              </Text>
              <Text wordBreak="break-word">
                <AppLink
                  href={
                    stillHere
                      ? ticketOnBoardPath(
                          cyclePath(cycle.projectId, cycle.id),
                          ticket.number,
                        )
                      : ticketByNumberPath(ticket.number)
                  }
                  scroll={!stillHere}
                  variant="inherit"
                >
                  {ticket.title}
                </AppLink>
              </Text>
              <Text color="text-600" fontSize="small">
                {ticket.status}
                {ticket.archived && ' · archived'}
              </Text>
            </Inline>
          </li>
        );
      })}
    </Stack>
  );
