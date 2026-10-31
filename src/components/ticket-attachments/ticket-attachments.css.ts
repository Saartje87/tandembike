import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/** A previewable image, scaled down to fit a small box. */
export const thumbnail = style({
  display: 'block',
  maxInlineSize: '100%',
  maxBlockSize: '12rem',
  borderRadius: vars.borderRadius[2],
});
