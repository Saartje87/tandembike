import { Heading, Inline, Stack, Text } from '@blockle/blocks';
import type { FC } from 'react';

import { cyclePath } from '../../app/lib/paths';
import type { Cycle } from '../../tickets/cycles';
import { AppLink } from '../app-link/app-link';
import { DateTime } from '../date-time/date-time';
import * as styles from './cycle-history.css';

export type CycleHistoryProps = {
  /** A Project's Cycles; only the Archived ones are listed. */
  cycles: Cycle[];
};

/**
 * A Project's History: its archived Cycles, newest archived first, each
 * linking to its read-only page with its final Tickets.
 */
export const CycleHistory: FC<CycleHistoryProps> = ({ cycles }) => {
  const archived = cycles
    .filter((cycle) => cycle.state === 'Archived')
    .sort(
      (left, right) =>
        (right.archivedAt?.getTime() ?? 0) - (left.archivedAt?.getTime() ?? 0),
    );

  return (
    <Stack gap={3}>
      <Heading level={2}>History</Heading>
      {archived.length === 0 ? (
        <Text tag="p" color="text-600">
          No archived Cycles yet
        </Text>
      ) : (
        <Stack
          tag="ul"
          gap={2}
          className={styles.cycleList}
          aria-label="Archived Cycles"
        >
          {archived.map((cycle) => (
            <li key={cycle.id}>
              <Inline gap={2} alignY="center">
                <AppLink href={cyclePath(cycle.projectId, cycle.id)}>
                  {cycle.title}
                </AppLink>
                <Text fontSize="small" color="text-600">
                  {cycle.ticketNumbers.length}{' '}
                  {cycle.ticketNumbers.length === 1 ? 'Ticket' : 'Tickets'}
                  {cycle.archivedAt && (
                    <>
                      {' · Archived '}
                      <DateTime date={cycle.archivedAt} />
                    </>
                  )}
                </Text>
              </Inline>
            </li>
          ))}
        </Stack>
      )}
    </Stack>
  );
};
