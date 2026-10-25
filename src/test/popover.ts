import { beforeAll } from 'vitest';

/**
 * Shows a Blocks `Popover` while it is open. jsdom's `showPopover` does not
 * open one, and its default styles hide every `[popover]` that is not, so
 * Testing Library would treat its content as hidden. Call it at the top of
 * a test file whose component opens a popover.
 */
export function showOpenPopovers() {
  beforeAll(() => {
    const style = document.createElement('style');
    style.textContent = '[popover][data-open] { display: block !important; }';
    document.head.append(style);
  });
}
