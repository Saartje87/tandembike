import { vars } from '@blockle/blocks';
import { globalStyle, style } from '@vanilla-extract/css';

/** Blocks has no single-side border atom. */
export const blockquote = style({
  borderInlineStart: `${vars.borderWidth.thick} solid ${vars.colorRole.neutral.border}`,
});

/** Blocks has no table component or table atoms. */
export const table = style({
  borderCollapse: 'collapse',
});

globalStyle(`${table} th, ${table} td`, {
  border: `${vars.borderWidth.thin} solid ${vars.colorRole.neutral.border}`,
  paddingBlock: vars.space[1],
  paddingInline: vars.space[2],
  textAlign: 'start',
});
