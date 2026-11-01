import { style } from '@vanilla-extract/css';

/** The part of the chat that scrolls; the header and reply input stay put. */
export const scroller = style({
  flexGrow: 1,
  minBlockSize: 0,
  overflowBlock: 'auto',
});
