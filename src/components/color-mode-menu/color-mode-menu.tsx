'use client';

import {
  Button,
  type ColorModeSetting,
  Popover,
  Stack,
  useColorMode,
} from '@blockle/blocks';
import { type FC, useRef, useState } from 'react';

import { writeColorMode } from '../../app/lib/color-mode';
import { claimEscape } from '../claim-escape/claim-escape';
import { Icon } from '../icon/icon';
import * as styles from './color-mode-menu.css';

const options: { setting: ColorModeSetting; label: string }[] = [
  { setting: 'light', label: 'Light' },
  { setting: 'dark', label: 'Dark' },
  { setting: 'system', label: 'System' },
];

/**
 * A button for the app header showing the resolved Color mode, a sun or a
 * moon, that opens a list of Light, Dark and System, the current one checked.
 * A pick applies at once, is stored for this browser and closes the list.
 * Escape closes the list and not what holds the button. It is built by hand
 * until it moves to Blocks `Menu` (T670).
 */
export const ColorModeMenu: FC = () => {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { colorMode } = useColorMode();

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
      {/* Ghost and inherit, as the header stays primary-600 with white in both modes. */}
      <Button
        ref={anchor}
        type="button"
        size="small"
        variant="ghost"
        intent="inherit"
        aria-label="Colour mode"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="sun" color="white" className={styles.light} />
        <Icon name="moon" color="white" className={styles.dark} />
      </Button>
      <Popover
        anchorElement={anchor}
        open={open}
        placement="bottom"
        onRequestClose={() => setOpen(false)}
        role="dialog"
        aria-label="Colour mode"
      >
        <Stack gap={1} padding={2}>
          {options.map(({ setting, label }) => (
            <Button
              key={setting}
              type="button"
              variant="ghost"
              size="small"
              aria-pressed={colorMode === setting}
              endSlot={
                colorMode === setting && <Icon name="check" size="small" />
              }
              onClick={() => {
                setOpen(false);
                writeColorMode(setting);
              }}
            >
              {label}
            </Button>
          ))}
        </Stack>
      </Popover>
    </div>
  );
};
