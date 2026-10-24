import { style } from '@vanilla-extract/css';

/** Blocks has no `listStyle` atom, and `Inline tag="ul"` keeps the markers. */
export const tabList = style({
  listStyle: 'none',
});
