import { style } from '@vanilla-extract/css';

/** Blocks has no `listStyle` atom, and `Inline` takes no `aria-label`. */
export const list = style({
  listStyle: 'none',
});
