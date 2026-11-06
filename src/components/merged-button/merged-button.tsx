'use client';

import { Button } from '@blockle/blocks';
import type { FC } from 'react';

import type { Ticket } from '../../tickets/tickets';

export type MergedButtonProps = {
  ticket: Pick<Ticket, 'number' | 'title'>;
  onMerged: () => void;
};

/**
 * Says the Ticket's PR is merged, so the User applies the completion rule
 * with one click. It checks nothing on GitHub.
 */
export const MergedButton: FC<MergedButtonProps> = ({ ticket, onMerged }) => (
  <Button
    type="button"
    variant="outline"
    size="small"
    aria-label={`Merged T${ticket.number} ${ticket.title}`}
    onClick={onMerged}
  >
    Merged
  </Button>
);
