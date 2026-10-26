'use client';

import { Button, Popover, Stack } from '@blockle/blocks';
import { type FC, useRef, useState } from 'react';

import type { Cycle } from '../../tickets/cycles';
import { claimEscape } from '../ticket-drawer/keep-drawer-open';

export type PlanIntoCycleMenuProps = {
  /** The Cycles to offer, in order. */
  cycles: Cycle[];
  disabled?: boolean;
  onPick: (cycle: Cycle) => void;
};

/**
 * A "Plan into Cycle" button that opens a list of Cycles to pick from, and
 * closes on a pick. Escape closes the list and not what holds the button.
 * Blocks has no menu component (docs/blocks-feedback.md, 20).
 */
export const PlanIntoCycleMenu: FC<PlanIntoCycleMenuProps> = ({
  cycles,
  disabled,
  onPick,
}) => {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

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
        Plan into Cycle
      </Button>
      <Popover
        anchorElement={anchor}
        open={open}
        position="top"
        onRequestClose={() => setOpen(false)}
        role="dialog"
        aria-label="Plan into Cycle"
      >
        <Stack gap={1} padding={2}>
          {cycles.map((cycle) => (
            <Button
              key={cycle.id}
              type="button"
              variant="ghost"
              size="small"
              onClick={() => {
                setOpen(false);
                onPick(cycle);
              }}
            >
              {cycle.title}
            </Button>
          ))}
        </Stack>
      </Popover>
    </div>
  );
};
