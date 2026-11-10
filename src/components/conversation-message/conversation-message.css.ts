import { style } from '@vanilla-extract/css';

/** A message may fill the reading column but never outgrows it, however long its words are. */
export const bubble = style({
  maxInlineSize: '100%',
  overflowWrap: 'anywhere',
});
