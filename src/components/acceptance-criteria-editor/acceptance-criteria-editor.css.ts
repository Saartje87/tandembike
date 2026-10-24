import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/** Blocks has no `listStyle` atom, and `Stack tag="ul"` keeps the markers. */
export const list = style({
  listStyle: 'none',
});

/** A criterion that can be dragged. */
export const sortable = style({});

/**
 * Its drag handle, faint until the criterion is hovered or focused. The
 * `opacity` atom has only `0` and `1` (docs/blocks-feedback.md).
 */
export const handle = style({
  opacity: 0.4,
  selectors: {
    [`${sortable}:hover &, ${sortable}:focus-within &`]: {
      opacity: 1,
    },
  },
});

/**
 * Blocks' Checkbox has a fixed size but shrinks beside text that wraps
 * (docs/blocks-feedback.md).
 */
export const checkbox = style({
  flexShrink: 0,
});

/**
 * A criterion's text, a button that opens its edit field. Blocks has no
 * unstyled button, the `cursor` atom has no `text`, the `textAlign` atom has
 * no `start`, and atoms have no `:hover` or `:focus-visible`
 * (docs/blocks-feedback.md).
 */
export const text = style({
  cursor: 'text',
  textAlign: 'start',
  ':hover': {
    backgroundColor: vars.color['neutral-100'],
  },
  ':focus-visible': {
    outline: 'none',
    boxShadow: vars.focus.boxShadow,
  },
});
