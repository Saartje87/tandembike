import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/** Wide enough for a row of the palette's swatches. */
export const panel = style({
  maxInlineSize: `calc(${vars.space[8]} * 7)`,
});

/** The icon buttons in even rows; `Grid` has no auto-fill columns. */
export const icons = style({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(${vars.space[6]}, 1fr))`,
  gap: vars.space[1],
});

/**
 * Blocks centres a popover on its anchor and never keeps it on screen
 * (T300), so under an icon at the page's edge it
 * would run off. Shifting it by half its width starts it at the icon's
 * centre. `translate`, not `transform`, which the theme animates.
 */
export const popover = style({
  translate: '50% 0',
});
