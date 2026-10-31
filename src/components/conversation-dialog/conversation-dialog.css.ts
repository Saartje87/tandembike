import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/**
 * The dialog's width and height: as wide as a chat needs and as high as the
 * window allows, so the tab panel scrolls and not the page. Blocks styles sit
 * in cascade layers, so this unlayered class wins.
 */
export const dialog = style({
  inlineSize: 'min(56rem, 100%)',
  blockSize: 'min(48rem, 100%)',
});

/** The dialog's content: header and tabs on top, the panel taking the rest. */
export const content = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space[3],
  blockSize: '100%',
  padding: vars.space[4],
  boxSizing: 'border-box',
});

/** The tab panel fills what is left; the chat in it scrolls its own messages. */
export const panel = style({
  flexGrow: 1,
  minBlockSize: 0,
});
