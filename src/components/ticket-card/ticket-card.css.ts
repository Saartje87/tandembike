import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/**
 * A card, whose checkbox shows when it is hovered or focused. A selected card
 * carried along by another one's drag is faded, which the `opacity` atom,
 * with only `0` and `1`, cannot express (T320).
 */
export const card = style({
  selectors: {
    '&[data-carried-along]': {
      opacity: 0.4,
    },
  },
});

/**
 * The count pill of a dragged selection, centred on the card's top-right
 * corner: inset atoms take only `0` (T320), and there is no
 * badge component (16).
 */
export const carryCount = style({
  transform: 'translate(25%, -50%)',
});

/**
 * A card's select checkbox: hidden until its card is hovered or focused, or
 * anything on the Board is selected, yet still reachable by Tab.
 */
export const selectBox = style({
  opacity: 0,
  selectors: {
    [`${card}:hover &, ${card}:focus-within &, ${card}[data-selecting] &`]: {
      opacity: 1,
    },
  },
});

export const cardContent = style({
  flex: 1,
  minInlineSize: 0,
});

export const title = style({
  minInlineSize: 0,
});

/** The line holding the Epic badge, which it may not grow past. */
export const epicLine = style({
  display: 'flex',
  minInlineSize: 0,
});

/**
 * The Epic link as a pill in the Epic's colour (set by `tinted`), never wider
 * than its line, so its truncated title gives way: Blocks has no badge (16).
 */
export const epicBadge = style({
  maxInlineSize: '100%',
  borderRadius: vars.borderRadius.full,
  paddingInline: vars.space[2],
  textDecoration: 'none',
});
