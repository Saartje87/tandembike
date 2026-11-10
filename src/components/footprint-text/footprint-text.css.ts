import { style } from '@vanilla-extract/css';

/**
 * The dotted underline that says a Footprint has a tooltip (ADR 0050). The
 * `textDecoration` atom sets the underline but has no style for it (T1377).
 */
export const hint = style({
  textDecorationStyle: 'dotted',
  // Below the subscript of CO₂e, so the dots do not hide it.
  textUnderlineOffset: '0.35em',
  cursor: 'help',
});
