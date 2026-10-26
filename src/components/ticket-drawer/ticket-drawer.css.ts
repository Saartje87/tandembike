import { vars } from '@blockle/blocks';
import { globalStyle, style } from '@vanilla-extract/css';

/**
 * Blocks' `Drawer` is a fixed 300px wide, has no size prop, and a
 * `className` replaces its own classes, so widen it through an attribute
 * instead. Blocks styles sit in cascade layers, so this unlayered rule wins.
 */
globalStyle('dialog[data-ticket-drawer]', {
  inlineSize: 'min(40rem, 100%)',
});

/** The title's input, at the heading's size. */
export const titleInput = style({
  fontFamily: vars.fontFamily.heading,
  fontSize: vars.fontSize.xlarge,
  fontWeight: vars.fontWeight.strong,
});
