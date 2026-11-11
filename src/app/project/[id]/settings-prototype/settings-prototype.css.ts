// PROTOTYPE (T1431): the floating variant switcher, outside the design.
import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

export const switcher = style({
  position: 'fixed',
  insetBlockEnd: vars.space[3],
  insetInlineStart: '50%',
  transform: 'translateX(-50%)',
  zIndex: 1000,
  background: vars.colorRole.surface.inverse,
  color: vars.colorRole.text.inverse,
  borderRadius: vars.borderRadius.full,
  boxShadow: vars.colorRole.shadow[4],
  paddingBlock: vars.space[1],
  paddingInline: vars.space[3],
  whiteSpace: 'nowrap',
  maxInlineSize: `calc(100vw - ${vars.space[4]})`,
  overflowX: 'auto',
});

// The chip row must not size its column by its content, or the page scrolls
// sideways at phone width.
export const chipScroller = style({
  contain: 'inline-size',
});
