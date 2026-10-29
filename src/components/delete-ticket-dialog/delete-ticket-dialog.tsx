'use client';

import {
  Alert,
  Button,
  Checkbox,
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
import { keepDrawerOpen } from '../keep-drawer-open/keep-drawer-open';
import { warningList } from './delete-ticket-dialog.css';

/** One child of an Epic, with what deleting it too would affect. */
export type ChildDeletion = Pick<Ticket, 'number' | 'title' | 'claim'> & {
  /** The Tickets it blocks. */
  blocks: RelatedTicket[];
};

export type DeleteTicketDialogProps = {
  ticket: Pick<Ticket, 'number' | 'title' | 'claim'>;
  /** The Tickets it blocks, which will no longer be blocked by it. */
  blocks: RelatedTicket[];
  /** The Claim on its Epic, which covers it too, or `null`. */
  epicClaim: TicketClaim | null;
  /** An Epic's children, archived ones included. Defaults to none. */
  epicChildren?: ChildDeletion[];
  /** Called once the Ticket is deleted, for example to close its drawer. */
  onDeleted?: () => void;
};

const noChildren: ChildDeletion[] = [];

const ownerOf = ({ agentRunId, agentName }: TicketClaim) =>
  claimOwner(agentRunId, agentName);

/**
 * A Delete button that asks before destroying a Ticket for good (ADR 0012),
 * naming it, the Tickets it will stop blocking and any Agent holding a Claim
 * on it. For an Epic with children it offers to delete them too, unchecked:
 * left unchecked they are detached and kept. Checked, the warnings cover the
 * children as well, leaving out Tickets deleted with them. Once deleted it
 * calls `onDeleted`; a refusal is shown in the dialog.
 */
export const DeleteTicketDialog: FC<DeleteTicketDialogProps> = ({
  ticket,
  blocks,
  epicClaim,
  epicChildren = noChildren,
  onDeleted,
}) => {
  const [open, setOpen] = useState(false);
  const [withChildren, setWithChildren] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startDelete] = useTransition();
  const headingId = useId();
  const descriptionId = useId();

  const deletedChildren = withChildren ? epicChildren : noChildren;
  const deleted = new Set([
    ticket.number,
    ...deletedChildren.map(({ number }) => number),
  ]);
  const unblocked = new Map(
    [...blocks, ...deletedChildren.flatMap((child) => child.blocks)]
      .filter(({ number }) => !deleted.has(number))
      .map((blocked) => [blocked.number, blocked]),
  );
  const warnings = [
    ...[...unblocked.values()].map(
      ({ number, title }) =>
        `T${number} ${title} will no longer be blocked by it.`,
    ),
    ...(ticket.claim ? [`${ownerOf(ticket.claim)} has claimed it.`] : []),
    ...(epicClaim ? [`${ownerOf(epicClaim)} has claimed its Epic.`] : []),
    ...deletedChildren.flatMap(({ number, title, claim }) =>
      claim ? [`${ownerOf(claim)} has claimed T${number} ${title}.`] : [],
    ),
  ];

  const close = () => {
    setOpen(false);
    setWithChildren(false);
    setError(undefined);
  };

  const confirm = () => {
    setError(undefined);
    startDelete(async () => {
      const result = await deleteTicket({
        number: ticket.number,
        withChildren,
      });
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
              Delete T{ticket.number}?
            </Heading>
            <Text id={descriptionId} tag="p">
              Delete T{ticket.number} "{ticket.title}" permanently? This can't
              be undone.
            </Text>
            {epicChildren.length > 0 && (
              <Checkbox
                name="withChildren"
                checked={withChildren}
                disabled={pending}
                onChange={(event) =>
                  setWithChildren(event.currentTarget.checked)
                }
              >
                Also delete its {epicChildren.length}{' '}
                {epicChildren.length === 1 ? 'child' : 'children'}
              </Checkbox>
            )}
            {warnings.length > 0 && (
              <Stack tag="ul" gap={1} className={warningList}>
                {warnings.map((warning) => (
                  <Text key={warning} asChild>
                    <li>{warning}</li>
                  </Text>
                ))}
              </Stack>
            )}
            {error && <Alert intent="danger">{error}</Alert>}
            <Inline gap={2}>
              <Button
                type="button"
                intent="danger"
                disabled={pending}
                onClick={confirm}
              >
                Delete T{ticket.number}
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
