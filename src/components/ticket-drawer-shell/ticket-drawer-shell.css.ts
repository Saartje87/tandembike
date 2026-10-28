import { globalStyle } from '@vanilla-extract/css';

/**
 * Blocks' `Drawer` is a fixed 300px wide, has no size prop, and a
 * `className` replaces its own classes, so widen it through an attribute
 * instead. Blocks styles sit in cascade layers, so this unlayered rule wins.
 */
globalStyle('dialog[data-ticket-drawer]', {
  inlineSize: 'min(40rem, 100%)',
});
