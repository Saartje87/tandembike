import { Heading, Inline, Stack, Text } from '@blockle/blocks';
import { type FC, useId } from 'react';

import { ticketByNumberPath } from '../../app/lib/paths';
import type { SplitOffTicket } from '../../tickets/origins';
import { AppLink } from '../app-link/app-link';
import * as styles from './split-off-tickets.css';

export type SplitOffTicketsProps = {
  /** The Tickets split from the Origin, by Ticket number. */
  items: SplitOffTicket[];
};

/**
 * The Tickets split from an Origin, in its drawer (ADR 0015): each linked
 * with its Status, and marked when archived.
 */
export const SplitOffTickets: FC<SplitOffTicketsProps> = ({ items }) => {
  const headingId = useId();
  return (
    <Stack gap={2}>
      <Heading id={headingId} level={3} fontSize="medium">
        Split-off Tickets
      </Heading>
      <Stack
        tag="ul"
        gap={1}
        aria-labelledby={headingId}
        className={styles.list}
      >
        {items.map((split) => (
          <li key={split.number}>
            <Inline gap={2} alignY="center" flexWrap="wrap">
              <AppLink href={ticketByNumberPath(split.number)}>
                #{split.number} {split.title}
              </AppLink>
              <Text fontSize="xsmall" color="text-600">
                {split.archived ? `${split.status} · Archived` : split.status}
              </Text>
            </Inline>
          </li>
        ))}
      </Stack>
    </Stack>
  );
};
