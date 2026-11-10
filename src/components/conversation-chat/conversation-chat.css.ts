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

/**
 * Everything under the transcript (notices, reply options, a Spar's bar, the
 * input) in the reading column the messages use: centred and capped at about
 * 64rem.
 */
export const replyArea = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space[3],
  inlineSize: '100%',
  maxInlineSize: '64rem',
  marginInline: 'auto',
  flexShrink: 0,
});
