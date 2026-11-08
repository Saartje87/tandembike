import type { MouseEvent } from 'react';

/** How a select gesture lands: `toggle` one row, or select a `range`. */
export type SelectMode = 'toggle' | 'range';

/** Whether a click asks to select rather than open the drawer. */
export const isSelectClick = (event: MouseEvent) =>
  event.metaKey || event.ctrlKey || event.shiftKey;

/** A Shift-click selects a range; any other select click toggles. */
export const selectModeOf = (event: Event | MouseEvent): SelectMode =>
  'shiftKey' in event && event.shiftKey ? 'range' : 'toggle';
