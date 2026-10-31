import { style } from '@vanilla-extract/css';

/**
 * A prefix is short, such as `#` or `ABC-`. The `inlineSize` atoms take only
 * `auto`, `full` and `fit-content`, and there are no size tokens, so the
 * field widths are set here.
 */
export const prefixField = style({
  inlineSize: '8rem',
});

/** The URL field takes the rest of the row. */
export const urlField = style({
  minInlineSize: '16rem',
});
