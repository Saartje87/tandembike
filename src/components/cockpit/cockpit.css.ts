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

/** A list's heading, which opens and closes it, without the native marker. */
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
