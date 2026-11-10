import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/**
 * A group's summary, which opens and closes it, without the native marker.
 * Blocks has no Disclosure, so a group is a native `<details>` (T1112).
 */
export const summary = style({
  cursor: 'pointer',
  listStyle: 'none',
  selectors: { '&::-webkit-details-marker': { display: 'none' } },
});

/** The summary's chevron, turned down while its group is open. */
export const chevron = style({
  display: 'inline-flex',
  transition: `transform ${vars.transition.fast}`,
  selectors: { 'details[open] > summary &': { transform: 'rotate(90deg)' } },
});

/** A step never outgrows the reading column, however long its input is. */
export const step = style({
  maxInlineSize: '100%',
  overflowWrap: 'anywhere',
});
