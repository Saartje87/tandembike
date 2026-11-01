import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/**
 * The dialog's height: as high as the window allows, so the tab panel scrolls
 * and not the page. Its width comes from `size="large"`; the theme has no
 * height size.
 */
export const dialog = style({
  blockSize: 'min(48rem, 100%)',
});

/**
 * The dialog's content: header and tabs on top, the panel taking the rest.
 * The dialog's theme pads it already.
 */
export const content = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space[3],
  blockSize: '100%',
  boxSizing: 'border-box',
});
