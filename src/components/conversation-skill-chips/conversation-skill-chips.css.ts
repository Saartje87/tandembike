import { style } from '@vanilla-extract/css';

/** A chip stays on one line. `Button` takes no `whiteSpace` atom. */
export const chip = style({
  whiteSpace: 'nowrap',
});
