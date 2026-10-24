import { Inline, Stack, Text } from '@blockle/blocks';
import type { FC } from 'react';

import { ticketPath } from '../../app/lib/paths';
import type { Ticket } from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import * as styles from './cycle-ticket-list.css';

export type CycleTicketListProps = {
  /** An archived Cycle's final Tickets, archived ones included. */
  tickets: Ticket[];
};

/**
 * An archived Cycle's Tickets, read-only: each with its number, a link that
 * opens it in the drawer, and its Status now.
 */
export const CycleTicketList: FC<CycleTicketListProps> = ({ tickets }) =>
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
      {tickets.map((ticket) => (
        <li key={ticket.number}>
          <Inline gap={2} alignY="center">
            <Text color="text-600" fontSize="small">
              #{ticket.number}
            </Text>
            <Text wordBreak="break-word">
              <AppLink
                href={ticketPath(ticket.projectId, ticket.number)}
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
      ))}
    </Stack>
  );
