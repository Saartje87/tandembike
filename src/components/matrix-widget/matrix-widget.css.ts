import { vars } from '@blockle/blocks';
import { createVar, style } from '@vanilla-extract/css';

/** An item's place on the matrix, from 0 to 1, set from the component. */
export const x = createVar();
export const y = createVar();

/** The square of the 2×2, split into quadrants by two lines through its middle. */
export const area = style({
  position: 'relative',
  margin: 0,
  padding: 0,
  minInlineSize: 0,
  inlineSize: '100%',
  maxInlineSize: '22rem',
  aspectRatio: '1',
  backgroundColor: vars.colorRole.surface.raised,
  border: `${vars.borderWidth.thin} solid ${vars.colorRole.border.default}`,
  borderRadius: vars.borderRadius[2],
  backgroundImage: `linear-gradient(to right, transparent calc(50% - 0.5px), ${vars.colorRole.border.default} calc(50% - 0.5px), ${vars.colorRole.border.default} calc(50% + 0.5px), transparent calc(50% + 0.5px)), linear-gradient(to bottom, transparent calc(50% - 0.5px), ${vars.colorRole.border.default} calc(50% - 0.5px), ${vars.colorRole.border.default} calc(50% + 0.5px), transparent calc(50% + 0.5px))`,
  touchAction: 'none',
});

/** An item placed on the matrix, centred on its position; y grows upward. */
export const placed = style({
  position: 'absolute',
  insetInlineStart: `calc(${x} * 100%)`,
  insetBlockEnd: `calc(${y} * 100%)`,
  transform: 'translate(-50%, 50%)',
  whiteSpace: 'nowrap',
  cursor: 'grab',
  touchAction: 'none',
});

/** An item not placed yet, waiting below the matrix. */
export const unplaced = style({
  cursor: 'grab',
  touchAction: 'none',
});
