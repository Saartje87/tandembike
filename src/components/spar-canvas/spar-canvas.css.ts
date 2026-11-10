import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/** The Columns side by side, scrolling sideways when they outgrow the region. */
export const columns = style({
  display: 'grid',
  gridAutoFlow: 'column',
  gridAutoColumns: 'minmax(13rem, 1fr)',
  gap: vars.space[3],
  overflowX: 'auto',
  paddingBlockEnd: vars.space[2],
  alignItems: 'start',
});

/** A Column: a sunken lane its Stickies sit in, tall enough to drop into when empty. */
export const column = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space[2],
  padding: vars.space[2],
  borderRadius: vars.borderRadius[2],
  backgroundColor: vars.colorRole.surface.sunken,
  minBlockSize: '8rem',
});
