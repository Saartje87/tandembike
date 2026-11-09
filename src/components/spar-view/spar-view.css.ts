import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/** The width from which the chat and the side region sit side by side: Blocks' `desktop`. */
const wide = 'screen and (min-width: 992px)';

/** The page: one column with a switcher, or the chat beside the Canvas and Write-up. */
export const layout = style({
  display: 'grid',
  gap: vars.space[4],
  gridTemplateColumns: 'minmax(0, 1fr)',
  '@media': {
    [wide]: {
      gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)',
      alignItems: 'start',
    },
  },
});

/** The Chat, Canvas and Write-up switcher, only at narrow widths. */
export const switcher = style({
  '@media': { [wide]: { display: 'none' } },
});

/** The chat column: as tall as the window allows, so its messages scroll. */
export const chat = style({
  blockSize: '75vh',
  minBlockSize: '24rem',
});

/**
 * A region of the page. At narrow widths only the one the switcher shows is
 * visible; at wide widths the chat and the side region always are.
 */
export const region = style({
  selectors: {
    '&[data-shown="false"]': { display: 'none' },
  },
  '@media': {
    [wide]: {
      selectors: {
        '&[data-shown="false"]': { display: 'block' },
      },
    },
  },
});
