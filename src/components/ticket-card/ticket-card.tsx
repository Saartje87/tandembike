'use client';

import { Box, Button, Inline, Stack, Text } from '@blockle/blocks';
import type { FC } from 'react';

import { ticketPath } from '../../app/lib/paths';
import type { Ticket } from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import { Icon } from '../icon/icon';
import { LabelList } from '../label-list/label-list';
import { useTicketChanged } from '../live-updates/live-updates';
import * as styles from './ticket-card.css';

export type TicketCardProps = {
  ticket: Ticket;
  cardRef?: (element: Element | null) => void;
  dragHandleRef?: (element: Element | null) => void;
};

type CriteriaProgressProps = Pick<Ticket, 'acceptanceCriteria'>;

/** A pill that says the Ticket is blocked by an unresolved Blocker. */
const BlockedMarker: FC = () => (
  // `Inline` takes no `role` and cannot render a `span` (docs/blocks-feedback.md, 15).
  <Box
    asChild
    display="flex"
    alignItems="center"
    gap={1}
    backgroundColor="warning-100"
    borderRadius="full"
    paddingInline={2}
  >
    <span role="img" aria-label="Blocked by an unresolved Ticket">
      <Icon name="lock-closed" size="small" color="warning-800" />
      <Text fontSize="xsmall" color="warning-800">
        Blocked
      </Text>
    </span>
  </Box>
);

/** How many acceptance criteria are checked, as `2/4`; nothing without any. */
const CriteriaProgress: FC<CriteriaProgressProps> = ({
  acceptanceCriteria,
}) => {
  if (acceptanceCriteria.length === 0) {
    return null;
  }
  const checked = acceptanceCriteria.filter((criterion) => criterion.checked);
  const total = acceptanceCriteria.length;

  // `Inline` takes no `role` and cannot render a `span` (docs/blocks-feedback.md, 15).
  return (
    <Box asChild display="flex" alignItems="center" gap={1}>
      <span
        role="img"
        aria-label={`Acceptance criteria: ${checked.length} of ${total} checked`}
      >
        <Icon name="check-circle" size="small" color="text-600" />
        <Text fontSize="xsmall" color="text-600">
          {checked.length}/{total}
        </Text>
      </span>
    </Box>
  );
};

/**
 * A Ticket on the Board: its number, title, whether it is blocked (unless it
 * is Done), labels and acceptance-criteria progress, and a drag handle.
 * It is highlighted for a moment after the Ticket changes (see `LiveUpdates`).
 */
export const TicketCard: FC<TicketCardProps> = ({
  ticket,
  cardRef,
  dragHandleRef,
}) => {
  const changed = useTicketChanged(ticket.number);
  // A Done Ticket's work is finished, so an open Blocker no longer matters here.
  const showBlocked = ticket.blocked && ticket.status !== 'Done';

  return (
    <Box
      asChild
      backgroundColor={changed ? 'primary-100' : 'background-100'}
      borderRadius={2}
      boxShadow={1}
      paddingBlock={0}
      paddingInlineEnd={3}
      transition="slow"
    >
      <li ref={cardRef} data-changed={changed ? '' : undefined}>
        <Inline gap={2} alignY="stretch">
          <Button
            ref={dragHandleRef}
            type="button"
            variant="ghost"
            size="small"
            alignSelf="stretch"
            aria-label={`Drag Ticket #${ticket.number} to another Status`}
          >
            <Icon name="bars-3" size="small" />
          </Button>
          <Stack gap={2} paddingBlock={3} className={styles.cardContent}>
            <Text wordBreak="break-word" className={styles.title}>
              <AppLink
                href={ticketPath(ticket.projectId, ticket.number)}
                variant="inherit"
                aria-label={ticket.title}
              >
                <Text color="text-600" fontSize="small" marginInlineEnd={1}>
                  #{ticket.number}
                </Text>

                {ticket.title}
              </AppLink>
            </Text>

            {showBlocked || ticket.labels.length > 0 ? (
              <Inline gap={1} alignY="center" flexWrap="wrap">
                {showBlocked && <BlockedMarker />}
                <LabelList labels={ticket.labels} />
              </Inline>
            ) : null}
            <CriteriaProgress acceptanceCriteria={ticket.acceptanceCriteria} />
          </Stack>
        </Inline>
      </li>
    </Box>
  );
};
