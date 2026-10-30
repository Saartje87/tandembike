import { vars } from '@blockle/blocks';
import { globalStyle, style } from '@vanilla-extract/css';

/** Blocks has no table component or table atoms (T503). */
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

/** A cell aligned to the start, where the rest align their figures to the end. */
export const startCell = style({
  selectors: { [`${table} &`]: { textAlign: 'start' } },
});

globalStyle(`${table} tfoot th, ${table} tfoot td`, {
  borderBlockEnd: 'none',
  borderBlockStart: `${vars.borderWidth.thick} solid ${vars.colorRole.neutral.border}`,
  fontWeight: vars.fontWeight.strong,
});
