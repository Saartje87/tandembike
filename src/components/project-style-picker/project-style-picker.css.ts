import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/** Wide enough for a row of the palette's swatches. */
export const panel = style({
  maxInlineSize: `calc(${vars.space[8]} * 7)`,
});
