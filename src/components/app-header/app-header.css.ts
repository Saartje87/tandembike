import { globalStyle, style } from '@vanilla-extract/css';

/**
 * The custom property on the root holding the app header's measured block
 * size, which `AppHeader` keeps up to date.
 */
export const appHeaderBlockSize = '--app-header-block-size';

// Above positioned page content later in the DOM, such as the Epic order's
// and the matrix widget's absolute parts. Blocks has no z-index atom (T1667).
// Its Dialog, Drawer and Menu render in the top layer, above any z-index.
export const header = style({
  zIndex: 1,
});

// Keyboard focus and `scrollIntoView` stop below the sticky header.
globalStyle(':root', {
  scrollPaddingBlockStart: `var(${appHeaderBlockSize}, 0px)`,
});
