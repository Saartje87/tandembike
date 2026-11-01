import { style } from '@vanilla-extract/css';

/**
 * A tab or its close button: one line at its own width, so the row scrolls
 * sideways when the tabs overflow instead of squeezing them into lines the
 * scroll box then clips. `Button` takes no `flexShrink` or `whiteSpace` atom.
 */
export const tabButton = style({
  flexShrink: 0,
  whiteSpace: 'nowrap',
});
