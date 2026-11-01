import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/**
 * The chat fills its tab panel: the messages take the space between the
 * header and the reply input and scroll, so the page never does.
 */
export const chat = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space[3],
  blockSize: '100%',
  minBlockSize: 0,
});
