import type { ColorMode } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

import { colorModeSelectors } from '../../app/lib/color-mode-selectors';

const descendant = (selectors: string) =>
  selectors
    .split(', ')
    .map((selector) => `${selector} &`)
    .join(', ');

/**
 * Hides an element where the resolved Color mode is `other`. CSS, not
 * `useColorMode`, so the first paint, before hydration, is already right.
 */
const hiddenIn = (other: ColorMode) => {
  const { set, system, query } = colorModeSelectors(other);
  return style({
    selectors: { [descendant(set)]: { display: 'none' } },
    '@media': query
      ? {
          [query]: { selectors: { [descendant(system)]: { display: 'none' } } },
        }
      : {},
  });
};

/** Shown in light mode only. */
export const light = hiddenIn('dark');

/** Shown in dark mode only. */
export const dark = hiddenIn('light');
