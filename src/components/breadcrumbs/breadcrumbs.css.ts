import { style } from '@vanilla-extract/css';

/** Lets the trail shrink inside a flex row, so the current entry can truncate. */
export const trail = style({
  minInlineSize: 0,
});

export const list = style({
  listStyle: 'none',
  paddingInlineStart: 0,
  marginBlock: 0,
});

/**
 * Blocks has no `minInlineSize` or `textOverflow` atom
 * (docs/blocks-feedback.md, 14): the current entry, and the row of its icon
 * and name, may shrink, and its name gives way with an ellipsis.
 */
export const current = style({
  minInlineSize: 0,
});

export const currentName = style({
  minInlineSize: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
