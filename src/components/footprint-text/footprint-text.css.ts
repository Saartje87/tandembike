import { style } from '@vanilla-extract/css';

/**
 * The dotted underline that says a Footprint has a tooltip (ADR 0050). The
 * `textDecoration` atom sets the underline but has no style for it (T1377).
 */
export const hint = style({
  textDecorationStyle: 'dotted',
  textUnderlineOffset: '0.2em',
  cursor: 'help',
});
