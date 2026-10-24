import { style } from '@vanilla-extract/css';

/** Blocks has no `listStyle` atom, and `Stack tag="ul"` keeps the markers. */
export const list = style({
  listStyle: 'none',
});
