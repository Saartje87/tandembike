import { Heading, Inline, Stack, Tag, Text } from '@blockle/blocks';
import type { FC } from 'react';

import { sparPath, ticketByNumberPath } from '../../app/lib/paths';
import type { SparListing } from '../../spars/spars';
import { AppLink } from '../app-link/app-link';
import { stateNames } from '../conversation-labels/conversation-labels';
import { RelativeTime } from '../relative-time/relative-time';

export type SparListProps = { spars: SparListing[] };

/**
 * A Project's Spars, newest first: each one's topic linking to its page, its
 * focus Ticket, its state (closed, or its Conversation's) and last activity.
 */
export const SparList: FC<SparListProps> = ({ spars }) => (
  <Stack gap={3}>
    <Heading level={2}>Spars</Heading>
    {spars.length === 0 ? (
      <Text tag="p" color="muted">
        No Spars yet. Start one to think an idea through with Claude.
      </Text>
    ) : (
      <Stack gap={2} aria-label="Spars" listStyle="none" role="list" asChild>
        <ul>
          {spars.map((spar) => (
            <li key={spar.id}>
              <Inline gap={2} alignY="center">
                <AppLink href={sparPath(spar.projectId, spar.id)}>
                  {spar.topic ?? `Spar ${spar.id}`}
                </AppLink>
                {spar.focusTicketNumber !== null && (
                  <AppLink href={ticketByNumberPath(spar.focusTicketNumber)}>
                    T{spar.focusTicketNumber} {spar.focusTitle}
                  </AppLink>
                )}
                <Tag intent={spar.closed ? 'neutral' : 'primary'}>
                  {spar.closed ? 'closed' : stateNames[spar.state]}
                </Tag>
                <Text fontSize="small" color="muted">
                  Last activity <RelativeTime date={spar.lastActivity} />
                </Text>
              </Inline>
            </li>
          ))}
        </ul>
      </Stack>
    )}
  </Stack>
);
