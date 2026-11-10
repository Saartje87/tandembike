import { minMediaQuery, vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/**
 * The dialog's size: the whole window on a narrow one, with no radius; from
 * tablet up the window less a small margin on each side, with the theme's
 * radius. It overrides the theme's `size` width and 90% height cap, which sit
 * in a cascade layer, so this unlayered class wins. Blocks' Dialog has no
 * fill-the-viewport size nor a height control (T1339).
 */
export const dialog = style({
  inlineSize: '100%',
  blockSize: '100%',
  maxInlineSize: '100%',
  maxBlockSize: '100%',
  borderRadius: 0,
  '@media': {
    [minMediaQuery('tablet')]: {
      inlineSize: `calc(100% - 2 * ${vars.space[3]})`,
      blockSize: `calc(100% - 2 * ${vars.space[3]})`,
      maxInlineSize: `calc(100% - 2 * ${vars.space[3]})`,
      maxBlockSize: `calc(100% - 2 * ${vars.space[3]})`,
      borderRadius: vars.borderRadius[2],
    },
  },
});

/**
 * The dialog's content: the tab row on top, the panel taking the rest.
 * The dialog's theme pads it already.
 */
export const content = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space[3],
  blockSize: '100%',
  boxSizing: 'border-box',
});
