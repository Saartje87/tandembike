import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Test files run in node, with no DOM, unless they start with
// `// @vitest-environment jsdom`.
if (typeof window !== 'undefined') {
  afterEach(cleanup);

  // jsdom has no modal dialogs. Blocks' `Dialog` and `Drawer` call these, so
  // stand in with the `open` attribute, which makes the content accessible.
  // Like a browser, move focus into the dialog: its first focusable element,
  // or the dialog itself. Blocks handles Escape on the dialog, so a key only
  // reaches it from inside (T295).
  HTMLDialogElement.prototype.showModal ??= function showModal(
    this: HTMLDialogElement,
  ) {
    this.open = true;
    const focusable = this.querySelector<HTMLElement>(
      '[autofocus], a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusable) {
      focusable.focus();
    } else {
      this.tabIndex = -1;
      this.focus();
    }
  };
  HTMLDialogElement.prototype.close ??= function close(
    this: HTMLDialogElement,
  ) {
    this.open = false;
  };
}
