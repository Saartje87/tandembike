import { style } from '@vanilla-extract/css';

/** Blocks has no `listStyle` atom, and `Stack` takes no `aria-labelledby`. */
export const list = style({
  listStyle: 'none',
});
