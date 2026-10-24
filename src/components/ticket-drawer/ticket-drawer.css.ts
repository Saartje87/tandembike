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

/**
 * The title as a button that reads as the heading it sits in. Blocks'
 * `Button` always draws a button (docs/blocks-feedback.md, 18).
 */
export const titleButton = style({
  appearance: 'none',
  display: 'block',
  inlineSize: '100%',
  margin: 0,
  paddingBlock: vars.space[1],
  paddingInline: vars.space[1],
  marginInline: `calc(-1 * ${vars.space[1]})`,
  border: 'none',
  borderRadius: vars.borderRadius[2],
  background: 'none',
  font: 'inherit',
  color: 'inherit',
  textAlign: 'start',
  overflowWrap: 'anywhere',
  cursor: 'text',
  ':hover': {
    backgroundColor: vars.color['neutral-100'],
  },
  ':focus-visible': {
    outline: 'none',
    boxShadow: vars.focus.boxShadow,
  },
});

/** The title's input, at the heading's size. */
export const titleInput = style({
  fontFamily: vars.fontFamily.heading,
  fontSize: vars.fontSize.xlarge,
  fontWeight: vars.fontWeight.strong,
});
