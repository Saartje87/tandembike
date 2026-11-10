import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

/** The tabs and panels fill the dialog's content, so a panel takes what the row leaves. */
export const tabs = style({
  display: 'flex',
  flexDirection: 'column',
  flexGrow: 1,
  minBlockSize: 0,
  gap: vars.space[3],
});

/** The tab list takes the tab row but what its actions need, and scrolls when it overflows. */
export const tabList = style({
  flexGrow: 1,
  minInlineSize: 0,
});

/** A panel fills what is left; the chat in it scrolls its own messages. */
export const panel = style({
  flexGrow: 1,
  minBlockSize: 0,
});
