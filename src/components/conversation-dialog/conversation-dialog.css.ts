import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/**
 * The dialog's width and height: the theme's `large` width, 800px up to 90%
 * of the window, and as high as the window allows, so the tab panel scrolls
 * and not the page. `size="large"` does not typecheck (T356), and the default
 * `small` sets the width to 400px. The theme's size styles are unlayered and
 * as specific as one class, so whichever stylesheet loads last would win; the
 * doubled class outranks them (T616).
 */
export const dialog = style({
  selectors: {
    '&&': {
      inlineSize: '50rem',
      maxInlineSize: '90%',
      blockSize: 'min(48rem, 100%)',
    },
  },
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

/** The tab panel fills what is left; the chat in it scrolls its own messages. */
export const panel = style({
  flexGrow: 1,
  minBlockSize: 0,
});
