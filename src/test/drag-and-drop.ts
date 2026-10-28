import { act } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { vi } from 'vitest';

/**
 * Stubs the browser APIs that `@dnd-kit/react` needs and jsdom lacks. Call
 * it at the top of a test file whose component can be dragged.
 */
export function stubDragAndDrop() {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      disconnect() {}
      observe() {}
      takeRecords() {
        return [];
      }
      unobserve() {}
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  );
  Object.defineProperty(document, 'getAnimations', {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: () => ({ finished: Promise.resolve() }),
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (media: string) => ({
      addEventListener() {},
      addListener() {},
      dispatchEvent() {
        return false;
      },
      matches: false,
      media,
      onchange: null,
      removeEventListener() {},
      removeListener() {},
    }),
  });
}

/** Lets dnd-kit handle the last key, which it does on the next frame. */
export async function nextFrame() {
  await act(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  });
}

/**
 * Drags by keyboard: focuses `handle`, lifts it with Space, presses `keys`,
 * and drops it with Space.
 */
export async function keyboardDrag(handle: HTMLElement, keys: string) {
  handle.focus();
  await userEvent.keyboard('{Space}');
  await nextFrame();
  await userEvent.keyboard(keys);
  await nextFrame();
  await userEvent.keyboard('{Space}');
}
