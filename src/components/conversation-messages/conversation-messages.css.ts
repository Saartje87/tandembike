import { style } from '@vanilla-extract/css';

/** The part of the chat that scrolls; the header and reply input stay put. */
export const scroller = style({
  flexGrow: 1,
  minBlockSize: 0,
  overflowBlock: 'auto',
});

/**
 * The messages, in the chat's reading column: centred and capped at about
 * 64rem, the same as the reply area's, so a wide window gives more lines, not
 * longer ones.
 */
export const list = style({
  maxInlineSize: '64rem',
  marginInline: 'auto',
});
