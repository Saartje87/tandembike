import { style } from '@vanilla-extract/css';

/**
 * The drawer's width, the same as a Ticket's (see `ticket-drawer-shell.css`),
 * as Blocks' `size="large"` only accepts `undefined` (T356).
 */
export const drawer = style({
  inlineSize: 'min(40rem, 100%)',
});
