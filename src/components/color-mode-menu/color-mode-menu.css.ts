import {
  type ColorMode,
  colorModeSelector,
  colorModes,
  systemColorModeQuery,
  systemColorModeSelectors,
} from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/**
 * Hides an element unless the resolved Color mode is `mode`: under another
 * set mode, or under `system` when the OS asks for another mode. CSS, not
 * `useColorMode`, so the first paint, before hydration, is already right.
 */
const shownIn = (mode: ColorMode) => {
  const others = colorModes.filter((other) => other !== mode);
  return style({
    selectors: Object.fromEntries(
      others.map((other) => [
        `${colorModeSelector(other)} &`,
        { display: 'none' },
      ]),
    ),
    '@media': Object.fromEntries(
      others.flatMap((other) => {
        const query = systemColorModeQuery(other);
        return query
          ? [
              [
                query,
                {
                  selectors: {
                    [systemColorModeSelectors
                      .map((selector) => `${selector} &`)
                      .join(', ')]: { display: 'none' },
                  },
                },
              ],
            ]
          : [];
      }),
    ),
  });
};

export const light = shownIn('light');

export const dark = shownIn('dark');
