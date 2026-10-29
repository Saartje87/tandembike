import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { claimEscape } from './claim-escape';

/** An input that reports what `claimEscape` says of each keydown. */
const renderInput = () => {
  const claimed = vi.fn();
  render(
    <input
      aria-label="Field"
      onKeyDown={(event) => claimed(claimEscape(event))}
    />,
  );
  return { input: screen.getByLabelText('Field'), claimed };
};

describe('claimEscape', () => {
  it('claims an Escape by preventing its default, letting it bubble on', () => {
    const { input, claimed } = renderInput();
    const onDocumentKeyDown = vi.fn();
    document.addEventListener('keydown', onDocumentKeyDown);

    const notPrevented = fireEvent.keyDown(input, { key: 'Escape' });

    document.removeEventListener('keydown', onDocumentKeyDown);
    expect(claimed).toHaveBeenCalledExactlyOnceWith(true);
    expect(notPrevented).toBe(false);
    expect(onDocumentKeyDown).toHaveBeenCalledOnce();
  });

  it('leaves any other key alone', () => {
    const { input, claimed } = renderInput();

    const notPrevented = fireEvent.keyDown(input, { key: 'Enter' });

    expect(claimed).toHaveBeenCalledExactlyOnceWith(false);
    expect(notPrevented).toBe(true);
  });
});
