import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/** A step's box: a raised surface with the theme's border, in both modes. */
export const step = style({
  border: `${vars.borderWidth.thin} solid ${vars.colorRole.border.default}`,
  backgroundColor: vars.colorRole.surface.raised,
  borderRadius: vars.borderRadius[2],
});
