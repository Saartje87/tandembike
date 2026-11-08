'use client';

import { Button } from '@blockle/blocks';
import type { FC } from 'react';

import type { Ticket } from '../../tickets/tickets';

export type MergedButtonProps = {
  ticket: Pick<Ticket, 'number' | 'title'>;
  onMerged: () => void;
  /** Disables the button while the action runs. Defaults to false. */
  pending?: boolean;
};

/**
 * Says the Ticket's PR is merged, so the User applies the completion rule
 * with one click. It checks nothing on GitHub.
 */
export const MergedButton: FC<MergedButtonProps> = ({
  ticket,
  onMerged,
  pending = false,
}) => (
  <Button
    type="button"
    variant="outline"
    size="small"
    aria-label={`Merged T${ticket.number} ${ticket.title}`}
    disabled={pending}
    onClick={onMerged}
  >
    Merged
  </Button>
);
