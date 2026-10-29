'use client';

import { Button, Popover, Stack } from '@blockle/blocks';
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
 * A "Move to Cycle" button that opens a list of the Cycles, and the Backlog,
 * a Board's selection can move to, and closes on a pick. It is left out
 * when there is nowhere to move. Escape closes the list and not what holds
 * the button. Blocks has no menu component (T323).
 */
export const MoveToCycleMenu: FC<MoveToCycleMenuProps> = ({
  cycles,
  cycleId,
  disabled,
  onPick,
}) => {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const targets = targetsOf(cycles, cycleId);

  if (targets.length === 0) {
    return null;
  }

  return (
    // Escape reaches this wrapper from the button or the popover.
    // biome-ignore lint/a11y/noStaticElementInteractions: it only claims Escape for the popover inside.
    <div
      onKeyDown={(event) => {
        if (open && claimEscape(event)) {
          setOpen(false);
        }
      }}
    >
      <Button
        ref={anchor}
        type="button"
        variant="ghost"
        size="small"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Move to Cycle
      </Button>
      <Popover
        anchorElement={anchor}
        open={open}
        position="top"
        onRequestClose={() => setOpen(false)}
        role="dialog"
        aria-label="Move to Cycle"
      >
        <Stack gap={1} padding={2}>
          {targets.map((target) => (
            <Button
              key={target.cycleId ?? 'backlog'}
              type="button"
              variant="ghost"
              size="small"
              onClick={() => {
                setOpen(false);
                onPick(target.cycleId);
              }}
            >
              {target.title}
            </Button>
          ))}
        </Stack>
      </Popover>
    </div>
  );
};
