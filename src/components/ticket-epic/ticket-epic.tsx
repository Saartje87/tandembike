'use client';

import { Alert, Button, Inline, Stack, Text } from '@blockle/blocks';
import { type FC, useOptimistic, useState, useTransition } from 'react';

import { ticketPath } from '../../app/lib/paths';
import { detachTicketFromEpic } from '../../app/tickets/actions';
import type { Ticket } from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import { keepDrawerOpen } from '../ticket-drawer/keep-drawer-open';

export type TicketEpicProps = {
  ticket: Pick<Ticket, 'number' | 'projectId' | 'epic'>;
};

/**
 * Which Epic a normal Ticket is a child of, in the Ticket drawer: a link to
 * it with Detach from Epic, or None. Detaching shows at once.
 */
export const TicketEpic: FC<TicketEpicProps> = ({ ticket }) => {
  const [epic, showEpic] = useOptimistic(ticket.epic);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const detach = () => {
    setError(undefined);
    startTransition(async () => {
      showEpic(null);
      const result = await detachTicketFromEpic({ number: ticket.number });
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  return (
    <Stack gap={1}>
      {epic ? (
        <Inline gap={2} alignY="center" flexWrap="wrap">
          <AppLink href={ticketPath(ticket.projectId, epic.number)}>
            #{epic.number} {epic.title}
          </AppLink>
          <Button
            type="button"
            variant="outline"
            intent="neutral"
            size="small"
            disabled={pending}
            onClick={(event) => {
              keepDrawerOpen(event);
              detach();
            }}
          >
            Detach from Epic
          </Button>
        </Inline>
      ) : (
        <Text color="text-600">None</Text>
      )}
      {error && <Alert intent="error">{error}</Alert>}
    </Stack>
  );
};
