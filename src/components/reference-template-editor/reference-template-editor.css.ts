import { style } from '@vanilla-extract/css';

/** Blocks has no `listStyle` atom, and `Stack tag="ul"` keeps the markers. */
export const list = style({
  listStyle: 'none',
});

/** A prefix is short, such as `#` or `ABC-`. */
export const prefixField = style({
  inlineSize: '8rem',
});

/** The URL field takes the rest of the row. */
export const urlField = style({
  flexGrow: 1,
  minInlineSize: '16rem',
});
