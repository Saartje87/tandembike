import { afterAll, beforeAll } from 'vitest';

/**
 * Lets a Blocks `Popover` open and close under jsdom, which has no Popover
 * API: `showPopover` and `hidePopover` become no-ops, and a stylesheet shows
 * the `[popover]` that Blocks marks `data-open`, so Testing Library sees its
 * content. Call it at the top of a test file whose component opens one, or
 * inside a `describe` to keep it to that block: dnd-kit drags differently
 * when the Popover API is there, so drag tests run without it.
 */
export function showOpenPopovers() {
  // Typed as optional, since jsdom has neither.
  const prototype: Partial<Pick<HTMLElement, 'showPopover' | 'hidePopover'>> =
    HTMLElement.prototype;
  const style = document.createElement('style');
  let stubbed = false;
  beforeAll(() => {
    if (!prototype.showPopover) {
      stubbed = true;
      prototype.showPopover = () => {};
      prototype.hidePopover = () => {};
    }
    style.textContent = '[popover][data-open] { display: block !important; }';
    document.head.append(style);
  });
  afterAll(() => {
    style.remove();
    if (stubbed) {
      delete prototype.showPopover;
      delete prototype.hidePopover;
    }
  });
}
