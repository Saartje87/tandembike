import { style } from '@vanilla-extract/css';

/** Lets the trail shrink inside a flex row, so the current entry can truncate. */
export const trail = style({
  minInlineSize: 0,
});
