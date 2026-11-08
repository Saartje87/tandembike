'use client';

import { Button } from '@blockle/blocks';
import type { FC } from 'react';

export type BackToTodoButtonProps = {
  /** Sends the Ticket Back to Todo; only the User's click calls it. */
  onClick: () => void;
  /** Disables the button while the action runs. Defaults to false. */
  pending?: boolean;
};

/** The action on a parked Ticket in its drawer: it goes Back to Todo. */
export const BackToTodoButton: FC<BackToTodoButtonProps> = ({
  onClick,
  pending = false,
}) => (
  <Button
    type="button"
    size="small"
    variant="outline"
    disabled={pending}
    onClick={onClick}
  >
    Back to Todo
  </Button>
);
