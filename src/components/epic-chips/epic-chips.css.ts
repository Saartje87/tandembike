import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/** Blocks has no `listStyle` atom, and `Inline tag="ul"` keeps the markers. */
export const chipList = style({
  listStyle: 'none',
});

/** A chip never grows past the row, so a long title wraps inside it. */
export const chip = style({
  maxInlineSize: '100%',
});

/** The New Epic field is as wide as a Status column's Ticket field. */
export const newEpic = style({
  maxInlineSize: `calc(${vars.space[8]} * 8)`,
});
