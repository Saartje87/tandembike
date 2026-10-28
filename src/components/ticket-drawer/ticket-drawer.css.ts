import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/** The title's input, at the heading's size. */
export const titleInput = style({
  fontFamily: vars.fontFamily.heading,
  fontSize: vars.fontSize.xlarge,
  fontWeight: vars.fontWeight.strong,
});
