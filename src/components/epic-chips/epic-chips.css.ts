import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/**
 * A chip never grows past the row, so a long title wraps inside it. It is not
 * a `Tag`: a `Tag` stays on one line, and its intents are not the Epic colours.
 */
export const chip = style({
  maxInlineSize: '100%',
});

/** The New Epic field is as wide as a Status column's Ticket field. */
export const newEpic = style({
  maxInlineSize: `calc(${vars.space[8]} * 8)`,
});

/**
 * A card is over the chip: an outline, since the background is the Epic's
 * colour.
 */
export const dropTarget = style({
  outline: `${vars.borderWidth.thick} solid ${vars.color['primary-500']}`,
  outlineOffset: vars.borderWidth.thick,
});
