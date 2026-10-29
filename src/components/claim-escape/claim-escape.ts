import type { KeyboardEvent } from 'react';

/**
 * Whether `event` is an Escape, and if so claims it with `preventDefault()`.
 * A Blocks `Drawer`, `Dialog` or `Popover` leaves a claimed Escape alone, so
 * an in-place edit or a popover inside the ticket drawer uses it to cancel or
 * close itself without closing the drawer.
 */
export const claimEscape = (event: KeyboardEvent): boolean => {
  if (event.key !== 'Escape') {
    return false;
  }
  event.preventDefault();
  return true;
};
