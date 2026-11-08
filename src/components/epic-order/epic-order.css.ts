import { vars } from '@blockle/blocks';
import { style, styleVariants } from '@vanilla-extract/css';

/**
 * The diagram's grid: rows of equal height, so the arrows' SVG can place each
 * end by its row and column as a share of the whole. As wide as its widest
 * row, which its section scrolls sideways.
 *
 * Blocks has no Disclosure, so the section is a native `<details>` (T1112).
 */
export const canvas = style({
  display: 'grid',
  gridAutoRows: '1fr',
  inlineSize: 'max-content',
  position: 'relative',
});

/** A row of the grid, painted over the arrows' SVG. */
export const row = style({
  display: 'flex',
  position: 'relative',
});

/**
 * One cell of a row, a node or empty, of a fixed width. The room below a
 * node holds the arrows down to the next row, and the bit above it their
 * heads.
 */
export const cell = style({
  inlineSize: `calc(${vars.space[8]} * 2.5)`,
  flexShrink: 0,
  paddingInline: vars.space[2],
  paddingBlockStart: vars.space[1],
  paddingBlockEnd: vars.space[4],
});

const nodeBase = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space[1],
  blockSize: '100%',
  paddingBlock: vars.space[1],
  paddingInline: vars.space[2],
  borderRadius: vars.borderRadius[2],
  borderWidth: vars.borderWidth.thin,
  borderStyle: 'solid',
  borderColor: vars.colorRole.border.default,
  backgroundColor: vars.colorRole.surface.raised,
  color: vars.colorRole.text.default,
  textDecoration: 'none',
});

/** A node, by how its Ticket shows. */
export const node = styleVariants({
  todo: [nodeBase],
  ready: [
    nodeBase,
    {
      borderColor: vars.colorRole.success.border,
      backgroundColor: vars.colorRole.success.subtle,
    },
  ],
  inProgress: [
    nodeBase,
    {
      borderWidth: vars.borderWidth.thick,
      borderColor: vars.colorRole.primary.solid,
    },
  ],
  done: [
    nodeBase,
    {
      backgroundColor: vars.colorRole.surface.sunken,
      color: vars.colorRole.text.muted,
    },
  ],
});

/**
 * A Blocker from outside the Epic: faded, with a dashed edge. Muted rather
 * than see-through, so arrows behind it stay hidden.
 */
export const outside = style({
  borderStyle: 'dashed',
  borderColor: vars.colorRole.border.default,
  backgroundColor: vars.colorRole.surface.sunken,
  color: vars.colorRole.text.muted,
});

/** The arrows, behind the rows. */
export const arrows = style({
  position: 'absolute',
  insetBlock: 0,
  insetInline: 0,
  inlineSize: '100%',
  blockSize: '100%',
  overflow: 'visible',
  pointerEvents: 'none',
});

export const arrow = style({
  stroke: vars.colorRole.border.strong,
  strokeWidth: vars.borderWidth.thin,
});

/** An arrow from a Blocker outside the Epic. */
export const outsideArrow = style({
  strokeDasharray: vars.space[1],
});

export const arrowHead = style({
  fill: vars.colorRole.border.strong,
});

/** The section's heading, which opens and closes it. */
export const summary = style({
  cursor: 'pointer',
  listStyle: 'none',
  selectors: { '&::-webkit-details-marker': { display: 'none' } },
});

/** The heading's chevron, turned down while the section is open. */
export const chevron = style({
  display: 'inline-flex',
  transition: `transform ${vars.transition.fast}`,
  selectors: { 'details[open] > summary &': { transform: 'rotate(90deg)' } },
});
