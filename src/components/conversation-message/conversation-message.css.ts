import { style } from '@vanilla-extract/css';

/** A message never outgrows the chat, however long its words are. */
export const bubble = style({
  maxInlineSize: '85%',
  overflowWrap: 'anywhere',
});
