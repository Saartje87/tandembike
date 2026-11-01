'use client';

import {
  type ColorModeSetting,
  IconButton,
  Menu,
  useColorMode,
} from '@blockle/blocks';
import type { FC } from 'react';

import { writeColorMode } from '../../app/lib/color-mode';
import { Icon } from '../icon/icon';
import * as styles from './color-mode-menu.css';

const options: { value: ColorModeSetting; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

/**
 * A button for the app header showing the resolved Color mode, a sun or a
 * moon, that opens a menu of Light, Dark and System as radio items, the
 * current one checked. A pick applies at once, is stored for this browser and
 * closes the menu. Escape closes the menu and not what holds the button.
 */
export const ColorModeMenu: FC = () => {
  const { colorMode } = useColorMode();

  return (
    <Menu
      items={[
        {
          type: 'radio-group',
          value: colorMode,
          onChange: (value) => writeColorMode(value as ColorModeSetting),
          items: options,
        },
      ]}
      aria-label="Colour mode"
    >
      {/* Ghost and inherit, as the header stays primary-600 with white in both modes. */}
      <IconButton
        type="button"
        size="small"
        variant="ghost"
        intent="inherit"
        label="Colour mode"
      >
        <Icon name="sun" color="white" className={styles.light} />
        <Icon name="moon" color="white" className={styles.dark} />
      </IconButton>
    </Menu>
  );
};
