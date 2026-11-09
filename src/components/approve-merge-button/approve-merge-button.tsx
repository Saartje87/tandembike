'use client';

import { Button } from '@blockle/blocks';
import type { FC } from 'react';

import type { Ticket } from '../../tickets/tickets';

export type ApproveMergeButtonProps = {
  ticket: Pick<Ticket, 'number' | 'title'>;
  onApprove: () => void;
  /** Disables the button while the action runs. Defaults to false. */
  pending?: boolean;
};

/**
 * The Merge gate (ADR 0038): the User approves the merge of the Ticket's
 * pull request with one click, and an Agent merges it.
 */
export const ApproveMergeButton: FC<ApproveMergeButtonProps> = ({
  ticket,
  onApprove,
  pending = false,
}) => (
  <Button
    type="button"
    size="small"
    aria-label={`Approve merge T${ticket.number} ${ticket.title}`}
    disabled={pending}
    onClick={onApprove}
  >
    Approve merge
  </Button>
);
