import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/** The Epic's colour as a round swatch, ringed in its strong shade. */
export const swatch = style({
  inlineSize: vars.space[5],
  blockSize: vars.space[5],
  border: `${vars.borderWidth.thick} solid currentColor`,
});
