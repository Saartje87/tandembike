import { vars } from '@blockle/blocks';
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

/** The line holding the Epic badge, which it may not grow past. */
export const epicLine = style({
  display: 'flex',
  minInlineSize: 0,
});

/**
 * The Epic link as a pill in the Epic's colour (set by `tinted`), on one
 * line, its title cut short with an ellipsis: Blocks has no badge (16) or
 * single-line ellipsis (14).
 */
export const epicBadge = style({
  maxInlineSize: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  borderRadius: vars.borderRadius.full,
  paddingInline: vars.space[2],
  textDecoration: 'none',
});
