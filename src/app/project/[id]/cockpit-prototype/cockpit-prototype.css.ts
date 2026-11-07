// PROTOTYPE (T1103), throwaway: styles atoms cannot express. Deleted by T1104.

import { vars } from '@blockle/blocks';
import { style, styleVariants } from '@vanilla-extract/css';

import { palette } from '../../../../components/palette/palette.css';

/** One child of an Epic in its children bar. */
export const pip = style({
  display: 'inline-block',
  inlineSize: vars.space[3],
  blockSize: vars.space[2],
  borderRadius: vars.borderRadius[1],
});

export const pipState = styleVariants({
  done: { backgroundColor: vars.colorRole.success.solid },
  review: { backgroundColor: vars.colorRole.info.solid },
  running: { backgroundColor: vars.colorRole.primary.solid },
  'needs-you': { backgroundColor: vars.colorRole.warning.solid },
  queued: {
    backgroundColor: vars.colorRole.surface.sunken,
    boxShadow: `inset 0 0 0 ${vars.borderWidth.thin} ${vars.colorRole.border.strong}`,
  },
});

/** An Epic's colour as a bar on the row's start edge. */
export const epicEdge = styleVariants(palette, ({ strong }) => ({
  borderInlineStart: `${vars.borderWidth.thick} solid ${strong}`,
}));

export const row = style({
  borderInlineStart: `${vars.borderWidth.thick} solid transparent`,
});

/** The floating variant and scenario switcher, apart from the design. */
export const switcher = style({
  position: 'fixed',
  insetBlockEnd: vars.space[4],
  insetInlineStart: '50%',
  transform: 'translateX(-50%)',
  zIndex: 100,
  background: vars.colorRole.surface.inverse,
  color: vars.colorRole.text.inverse,
  borderRadius: vars.borderRadius.full,
  boxShadow: vars.colorRole.shadow[4],
  paddingBlock: vars.space[2],
  paddingInline: vars.space[4],
  maxInlineSize: `calc(100vw - ${vars.space[6]})`,
});

export const summary = style({
  cursor: 'pointer',
  listStyle: 'none',
  selectors: { '&::-webkit-details-marker': { display: 'none' } },
});
