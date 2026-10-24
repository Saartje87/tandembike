import { style } from '@vanilla-extract/css';

export const cardContent = style({
  flex: 1,
  minInlineSize: 0,
});

export const titleLine = style({
  minInlineSize: 0,
});

export const title = style({
  minInlineSize: 0,
});

export const description = style({
  display: '-webkit-box',
  overflow: 'hidden',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
});
