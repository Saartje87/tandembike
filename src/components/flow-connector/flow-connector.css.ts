import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/**
 * The bar the branches hang from, spanning from the middle of the first
 * branch to the middle of the second: each takes half the width.
 */
export const bar = style({
  marginInline: '25%',
  borderBlockStart: `${vars.borderWidth.thick} solid ${vars.colorRole.border.strong}`,
});
