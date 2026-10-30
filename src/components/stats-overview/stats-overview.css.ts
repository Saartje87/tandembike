import { vars } from '@blockle/blocks';
import { globalStyle, style } from '@vanilla-extract/css';

/** Blocks has no table component or table atoms. */
export const table = style({
  borderCollapse: 'collapse',
  inlineSize: '100%',
});

globalStyle(`${table} th, ${table} td`, {
  borderBlockEnd: `${vars.borderWidth.thin} solid ${vars.colorRole.neutral.border}`,
  paddingBlock: vars.space[2],
  paddingInline: vars.space[3],
  textAlign: 'end',
  whiteSpace: 'nowrap',
});

globalStyle(`${table} th:first-child, ${table} td:nth-child(6)`, {
  textAlign: 'start',
});

globalStyle(`${table} tfoot th, ${table} tfoot td`, {
  borderBlockEnd: 'none',
  borderBlockStart: `${vars.borderWidth.thick} solid ${vars.colorRole.neutral.border}`,
  fontWeight: vars.fontWeight.strong,
});
