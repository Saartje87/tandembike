import { beforeAll } from 'vitest';

/**
 * Lets a Blocks `Popover` open and close under jsdom, which has no Popover
 * API: `showPopover` and `hidePopover` become no-ops, and a stylesheet shows
 * the `[popover]` that Blocks marks `data-open`, so Testing Library sees its
 * content. Call it at the top of a test file whose component opens one.
 */
export function showOpenPopovers() {
  beforeAll(() => {
    HTMLElement.prototype.showPopover ??= () => {};
    HTMLElement.prototype.hidePopover ??= () => {};
    const style = document.createElement('style');
    style.textContent = '[popover][data-open] { display: block !important; }';
    document.head.append(style);
  });
}
