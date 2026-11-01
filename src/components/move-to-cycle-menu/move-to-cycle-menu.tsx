'use client';

import { Button, Menu, type MenuItem } from '@blockle/blocks';
import { type FC, useRef, useState } from 'react';

import type { Cycle } from '../../tickets/cycles';
import { claimEscape } from '../claim-escape/claim-escape';

export type MoveToCycleMenuProps = {
  /** The Project's Cycles; the Archived ones are not offered. */
  cycles: Cycle[];
  /** The Board's Cycle, which is not offered, or `null` on the Backlog. */
  cycleId: number | null;
  disabled?: boolean;
  /** Called with the Cycle picked, or `null` for the Backlog. */
  onPick: (cycleId: number | null) => void;
};

type Target = { cycleId: number | null; title: string };

/**
 * Where a Board's selection can move: the other open Cycles, the Active one
 * first, then the Backlog when the Board is a Cycle's.
 */
function targetsOf(cycles: Cycle[], cycleId: number | null): Target[] {
  const open = cycles.filter(
    ({ id, state }) => state !== 'Archived' && id !== cycleId,
  );
  return [
    ...open.filter(({ state }) => state === 'Active'),
    ...open.filter(({ state }) => state === 'Prepared'),
  ]
    .map(({ id, title }): Target => ({ cycleId: id, title }))
    .concat(cycleId === null ? [] : [{ cycleId: null, title: 'Backlog' }]);
}

/**
 * A "Move to Cycle" button that opens a menu of the Cycles, and the Backlog,
 * a Board's selection can move to, and closes on a pick. It is left out
 * when there is nowhere to move.
 */
export const MoveToCycleMenu: FC<MoveToCycleMenuProps> = ({
  cycles,
  cycleId,
  disabled,
  onPick,
}) => {
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const targets = targetsOf(cycles, cycleId);

  if (targets.length === 0) {
    return null;
  }

  return (
    // Blocks `Menu` closes on Escape but leaves it unclaimed, so a Drawer
    // around it closes too (Blocks T675). Claiming it here, ahead of the
    // Drawer, closes only the menu; `Menu` is controlled so it still closes.
    // biome-ignore lint/a11y/noStaticElementInteractions: it only claims Escape for the menu inside.
    <div
      onKeyDown={(event) => {
        if (open && claimEscape(event)) {
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <Menu
        placement="top"
        open={open}
        onOpenChange={setOpen}
        items={targets.map(
          (target): MenuItem => ({
            label: target.title,
            onSelect: () => onPick(target.cycleId),
          }),
        )}
      >
        <Button
          ref={button}
          type="button"
          variant="ghost"
          size="small"
          disabled={disabled}
        >
          Move to Cycle
        </Button>
      </Menu>
    </div>
  );
};
