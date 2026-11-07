'use client';

import { Button, Menu, type MenuItem } from '@blockle/blocks';
import type { FC } from 'react';

import type { Ticket } from '../../tickets/tickets';

export type AddToEpicMenuProps = {
  /** The Project's Epics, in the order they are offered. */
  epics: Pick<Ticket, 'number' | 'title'>[];
  disabled?: boolean;
  /** Called with the number of the Epic picked. */
  onPick: (epic: number) => void;
};

/**
 * An "Add to Epic" button that opens a menu of the Project's Epics a
 * selection can join, and closes on a pick. It is left out when the Project
 * has no Epic.
 */
export const AddToEpicMenu: FC<AddToEpicMenuProps> = ({
  epics,
  disabled,
  onPick,
}) => {
  if (epics.length === 0) {
    return null;
  }

  return (
    <Menu
      placement="top"
      items={epics.map(
        (epic): MenuItem => ({
          label: `T${epic.number} ${epic.title}`,
          onSelect: () => onPick(epic.number),
        }),
      )}
    >
      <Button type="button" variant="ghost" size="small" disabled={disabled}>
        Add to Epic
      </Button>
    </Menu>
  );
};
