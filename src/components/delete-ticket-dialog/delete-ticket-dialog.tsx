'use client';

import {
  Alert,
  Button,
  Dialog,
  Heading,
  Inline,
  Stack,
  Text,
} from '@blockle/blocks';
import { type FC, useId, useState, useTransition } from 'react';

import { deleteTicket } from '../../app/tickets/actions';
import { claimOwner } from '../../tickets/claim-owner';
import type { RelatedTicket, Ticket, TicketClaim } from '../../tickets/tickets';
import { keepDrawerOpen } from '../ticket-drawer/keep-drawer-open';
import { warningList } from './delete-ticket-dialog.css';

export type DeleteTicketDialogProps = {
  ticket: Pick<Ticket, 'number' | 'title' | 'claim'>;
  /** The Tickets it blocks, which will no longer be blocked by it. */
  blocks: RelatedTicket[];
  /** The Claim on its Epic, which covers it too, or `null`. */
  epicClaim: TicketClaim | null;
  /** Called once the Ticket is deleted, for example to close its drawer. */
  onDeleted?: () => void;
};

const ownerOf = ({ agentRunId, agentName }: TicketClaim) =>
  claimOwner(agentRunId, agentName);

/**
 * A Delete button that asks before destroying a Ticket for good (ADR 0012),
 * naming it, the Tickets it will stop blocking and any Agent holding a Claim
 * on it. Once deleted it calls `onDeleted`; a refusal is shown in the
 * dialog.
 */
export const DeleteTicketDialog: FC<DeleteTicketDialogProps> = ({
  ticket,
  blocks,
  epicClaim,
  onDeleted,
}) => {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startDelete] = useTransition();
  const headingId = useId();
  const descriptionId = useId();

  const warnings = [
    ...blocks.map(
      ({ number, title }) =>
        `#${number} ${title} will no longer be blocked by it.`,
    ),
    ...(ticket.claim ? [`${ownerOf(ticket.claim)} has claimed it.`] : []),
    ...(epicClaim ? [`${ownerOf(epicClaim)} has claimed its Epic.`] : []),
  ];

  const close = () => {
    setOpen(false);
    setError(undefined);
  };

  const confirm = () => {
    setError(undefined);
    startDelete(async () => {
      const result = await deleteTicket({ number: ticket.number });
      if (result.ok) {
        onDeleted?.();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        intent="danger"
        size="small"
        onClick={() => setOpen(true)}
      >
        Delete
      </Button>
      <Dialog
        open={open}
        onRequestClose={close}
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
      >
        {open && (
          <Stack gap={4}>
            <Heading id={headingId} level={2}>
              Delete #{ticket.number}?
            </Heading>
            <Text id={descriptionId} tag="p">
              Delete #{ticket.number} "{ticket.title}" permanently? This can't
              be undone.
            </Text>
            {warnings.length > 0 && (
              <Stack tag="ul" gap={1} className={warningList}>
                {warnings.map((warning) => (
                  <Text key={warning} asChild>
                    <li>{warning}</li>
                  </Text>
                ))}
              </Stack>
            )}
            {error && <Alert intent="error">{error}</Alert>}
            <Inline gap={2}>
              <Button
                type="button"
                intent="danger"
                disabled={pending}
                onClick={confirm}
              >
                Delete #{ticket.number}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={(event) => {
                  keepDrawerOpen(event);
                  close();
                }}
              >
                Cancel
              </Button>
            </Inline>
          </Stack>
        )}
      </Dialog>
    </>
  );
};
