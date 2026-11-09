import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

const ink = vars.colorRole.border.strong;

/** The arrow's shaft: a vertical line in the theme's strong border colour. */
export const shaft = style({
  inlineSize: 0,
  blockSize: vars.space[4],
  borderInlineStart: `${vars.borderWidth.thick} solid ${ink}`,
});

/** The arrow's head: a triangle pointing down, drawn with borders. */
export const head = style({
  inlineSize: 0,
  blockSize: 0,
  borderInline: `${vars.space[1]} solid transparent`,
  borderBlockStart: `${vars.space[1]} solid ${ink}`,
});
