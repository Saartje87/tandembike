import type { KeyboardEvent, MouseEvent } from 'react';

/**
 * For a click whose handler unmounts its own button. The ticket drawer
 * treats a click whose target has left the dialog as an outside click and
 * closes, and React listens on the document, so stop the other listeners
 * there too, not just further bubbling (T297).
 */
export const keepDrawerOpen = (event: MouseEvent) => {
  event.nativeEvent.stopImmediatePropagation();
};

/**
 * Whether `event` is an Escape, and if so keeps it from the ticket drawer, which closes on
 * any Escape that reaches the document. React listens on the document too,
 * so stop the other listeners there, not just further bubbling
 * (T298). An in-place edit uses it to cancel without
 * closing the drawer.
 */
export const claimEscape = (event: KeyboardEvent): boolean => {
  if (event.key !== 'Escape') {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
  return true;
};
