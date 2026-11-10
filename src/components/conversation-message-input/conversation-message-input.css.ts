import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/**
 * The textarea's wrapper: it takes the row beside Send, starts at one line
 * in place of the theme's 96px minimum, and stops at about eight lines, then
 * scrolls. Unlayered, so it outranks the theme's layered min and max height;
 * a `grow` Textarea keeps the theme's 96px minimum otherwise (T1341).
 */
export const field = style({
  flexGrow: 1,
  minInlineSize: 0,
  minBlockSize: 'auto',
  maxBlockSize: `calc(8lh + 2 * ${vars.space[2]})`,
});
