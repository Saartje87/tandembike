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
 * corner: inset atoms take only `0` (T320). It is a `Box`, not a `Tag`: `Tag`
 * has only subtle intents, not a solid one, and takes no position atoms.
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
 * The Epic link as a `Tag` in the Epic's colour, set by `tinted` since `Tag`'s
 * intents are not the Epic colours, never wider than its line, so its
 * truncated title gives way.
 */
export const epicBadge = style({
  maxInlineSize: '100%',
  textDecoration: 'none',
});
