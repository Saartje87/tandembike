import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/**
 * The text at rest: a button that reads as the text around it, with only a
 * hover tint and a focus ring. Blocks has no unstyled button or inline-edit
 * component, and atoms have no `cursor: text`, logical `textAlign` or
 * `:hover` (docs/blocks-feedback.md, 18).
 */
export const text = style({
  appearance: 'none',
  display: 'block',
  inlineSize: '100%',
  margin: 0,
  paddingBlock: vars.space[1],
  paddingInline: vars.space[1],
  marginInline: `calc(-1 * ${vars.space[1]})`,
  border: 'none',
  borderRadius: vars.borderRadius[2],
  background: 'none',
  font: 'inherit',
  color: 'inherit',
  textAlign: 'start',
  overflowWrap: 'anywhere',
  cursor: 'text',
  ':hover': {
    backgroundColor: vars.color['neutral-100'],
  },
  ':focus-visible': {
    outline: 'none',
    boxShadow: vars.focus.boxShadow,
  },
});
