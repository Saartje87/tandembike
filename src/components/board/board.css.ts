import { vars } from '@blockle/blocks';
import { style, styleVariants } from '@vanilla-extract/css';

import { palette } from '../palette/palette.css';

/** A row's start edge, coloured by its Epic when it has one. */
export const edge = style({
  borderInlineStart: `${vars.borderWidth.thick} solid transparent`,
});

export const epicEdge = styleVariants(palette, ({ strong }) => ({
  borderInlineStart: `${vars.borderWidth.thick} solid ${strong}`,
}));

/**
 * A list's heading, which opens and closes it, without the native marker.
 * Blocks has no Disclosure, so the lists are native `<details>` (T1112).
 */
export const summary = style({
  cursor: 'pointer',
  listStyle: 'none',
  selectors: { '&::-webkit-details-marker': { display: 'none' } },
});

/** The heading's chevron, turned down while its list is open. */
export const chevron = style({
  display: 'inline-flex',
  transition: `transform ${vars.transition.fast}`,
  selectors: { 'details[open] > summary &': { transform: 'rotate(90deg)' } },
});

/** One child of an Epic in its row's children bar. */
export const pip = style({
  display: 'inline-block',
  inlineSize: vars.space[3],
  blockSize: vars.space[2],
  borderRadius: vars.borderRadius[1],
});

export const pipState = styleVariants({
  done: { backgroundColor: vars.colorRole.success.solid },
  // Finished on the Epic's branch, not yet merged: done's colour, hollowed.
  built: {
    backgroundColor: vars.colorRole.success.subtle,
    boxShadow: `inset 0 0 0 ${vars.borderWidth.thin} ${vars.colorRole.success.solid}`,
  },
  // In progress, not built: the primary colour, hollowed like built (T1263).
  started: {
    backgroundColor: vars.colorRole.primary.subtle,
    boxShadow: `inset 0 0 0 ${vars.borderWidth.thin} ${vars.colorRole.primary.solid}`,
  },
  'needs-you': { backgroundColor: vars.colorRole.warning.solid },
  queued: {
    backgroundColor: vars.colorRole.surface.sunken,
    boxShadow: `inset 0 0 0 ${vars.borderWidth.thin} ${vars.colorRole.border.strong}`,
  },
});
