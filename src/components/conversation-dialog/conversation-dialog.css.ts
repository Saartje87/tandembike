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
