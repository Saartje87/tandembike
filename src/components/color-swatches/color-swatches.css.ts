import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/**
 * A round swatch: the colour's tint, ringed in its strong shade (the
 * `currentColor` the `tinted` class sets), so it reads on any background.
 */
export const swatch = style({
  inlineSize: vars.space[4],
  blockSize: vars.space[4],
  border: `${vars.borderWidth.thick} solid currentColor`,
});
