import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/**
 * The quiet button: the number as plain muted text, with only a hover tint
 * and a focus ring. Its text and its icon share one grid cell, so the icon
 * shows over the number without changing the button's width. Blocks has no
 * unstyled button and atoms have no `:hover` or `visibility` (T322).
 */
export const quiet = style({
  appearance: 'none',
  display: 'inline-grid',
  placeItems: 'center',
  margin: 0,
  paddingInline: vars.space[1],
  marginInline: `calc(-1 * ${vars.space[1]})`,
  paddingBlock: 0,
  border: 'none',
  borderRadius: vars.borderRadius[2],
  background: 'none',
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
  ':hover': {
    backgroundColor: vars.colorRole.surface.sunken,
  },
  ':focus-visible': {
    outline: 'none',
    boxShadow: vars.colorRole.focusRing.boxShadow,
  },
});

/** The text and the icon, stacked in the button's one cell. */
export const stacked = style({
  gridArea: '1 / 1',
});

/** The number while the icon shows over it: hidden, keeping its space. */
export const hidden = style({
  visibility: 'hidden',
});
