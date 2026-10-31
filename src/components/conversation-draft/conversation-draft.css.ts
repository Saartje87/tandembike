import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/** The draft fills its tab panel; the input sits at the bottom, like the chat's reply. */
export const draft = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space[3],
  blockSize: '100%',
  minBlockSize: 0,
});

export const form = style({ marginBlockStart: 'auto' });
