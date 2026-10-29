import { style } from '@vanilla-extract/css';

/**
 * The drawer's width, as Blocks' `size="large"` would give it, but that prop
 * only accepts `undefined` (T356). Blocks styles sit in cascade layers, so
 * this unlayered class wins.
 */
export const drawer = style({
  inlineSize: 'min(40rem, 100%)',
});
