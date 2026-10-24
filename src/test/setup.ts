import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Node-environment test files (`// @vitest-environment node`) have no DOM.
if (typeof window !== 'undefined') {
  afterEach(cleanup);

  // jsdom has no modal dialogs. Blocks' `Dialog` and `Drawer` call these, so
  // stand in with the `open` attribute, which makes the content accessible.
  HTMLDialogElement.prototype.showModal ??= function showModal(
    this: HTMLDialogElement,
  ) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function close(
    this: HTMLDialogElement,
  ) {
    this.open = false;
  };
}
