import { style } from '@vanilla-extract/css';

/** The line may shrink below its text, which `Text truncate` then cuts. */
export const line = style({
  minInlineSize: 0,
  flex: '0 1 auto',
});

/** The elapsed time keeps its width while the line gives way. */
export const elapsed = style({
  flexShrink: 0,
});
