'use client';

import { Alert, Button, Popover, Stack } from '@blockle/blocks';
import { type FC, useOptimistic, useRef, useState, useTransition } from 'react';

import { updateTicket } from '../../app/tickets/actions';
import type { PaletteColor } from '../../tickets/palette';
import type { EpicLink } from '../../tickets/tickets';
import {
  ColorSwatches,
  colorName,
  Swatch,
} from '../color-swatches/color-swatches';
import { claimEscape } from '../keep-drawer-open/keep-drawer-open';

export type EpicColorPickerProps = {
  epic: Pick<EpicLink, 'number' | 'color'>;
};

/**
 * An Epic's colour in its drawer: a swatch that opens the palette, with no
 * Default, since every Epic has a colour. A pick saves at once and goes
 * back, with the reason in the popover, when it is refused. Escape closes
 * the popover and not the drawer.
 */
export const EpicColorPicker: FC<EpicColorPickerProps> = ({ epic }) => {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [color, showColor] = useOptimistic<PaletteColor>(epic.color);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();

  const pick = (picked: PaletteColor | null) => {
    if (picked === null) {
      return;
    }
    setError(undefined);
    startTransition(async () => {
      showColor(picked);
      const result = await updateTicket({ number: epic.number, color: picked });
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  return (
    // Escape reaches this wrapper from the swatch button or the popover.
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
        aria-label={`Epic colour: ${colorName(color)}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Swatch color={color} />
      </Button>
      <Popover
        anchorElement={anchor}
        open={open}
        position="bottom"
        onRequestClose={() => setOpen(false)}
        role="dialog"
        aria-label="Epic colour"
      >
        <Stack gap={2} padding={3}>
          <ColorSwatches value={color} onPick={pick} />
          {error && <Alert intent="danger">{error}</Alert>}
        </Stack>
      </Popover>
    </div>
  );
};
