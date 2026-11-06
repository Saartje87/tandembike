'use client';

import { Button } from '@blockle/blocks';
import type { FC } from 'react';

export type BackToTodoButtonProps = {
  /** Sends the Ticket Back to Todo; only the User's click calls it. */
  onClick: () => void;
};

/** The action on a stalled card: its Ticket goes Back to Todo. */
export const BackToTodoButton: FC<BackToTodoButtonProps> = ({ onClick }) => (
  <Button size="small" variant="outline" onClick={onClick}>
    Back to Todo
  </Button>
);
