import { style } from '@vanilla-extract/css';

export const page = style({
  minBlockSize: 'calc(100vh - 3rem)',
});

export const content = style({
  maxInlineSize: '48rem',
});
