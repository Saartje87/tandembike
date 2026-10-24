import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { CopyTicketNumber } from './copy-ticket-number';

const stubClipboard = (clipboard: Partial<Clipboard> | undefined) =>
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: clipboard,
  });

const copyButton = () =>
  screen.getByRole('button', { name: 'Copy Ticket number #42' });

/** Clicks the button and lets the clipboard write settle. */
const copy = async () => {
  fireEvent.click(copyButton());
  await act(async () => {});
};

describe('CopyTicketNumber', () => {
  afterEach(() => {
    stubClipboard(undefined);
    vi.useRealTimers();
  });

  it('copies the number as #42', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });
    renderWithTheme(<CopyTicketNumber number={42} />);

    expect(copyButton()).toHaveTextContent('#42');

    await copy();

    expect(writeText).toHaveBeenCalledWith('#42');
  });

  // The drawer closes on a document click whose target has left the dialog,
  // and the click swaps the button's text and icon.
  it('keeps the click from reaching the document', async () => {
    stubClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    const onDocumentClick = vi.fn();
    document.addEventListener('click', onDocumentClick);
    onTestFinished(() =>
      document.removeEventListener('click', onDocumentClick),
    );
    renderWithTheme(<CopyTicketNumber number={42} />);

    await copy();
    await copy();

    expect(onDocumentClick).not.toHaveBeenCalled();
  });

  it('confirms the copy in place and announces it, then shows the number again', async () => {
    vi.useFakeTimers();
    stubClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    renderWithTheme(<CopyTicketNumber number={42} />);

    expect(screen.getByRole('status')).toHaveTextContent('');

    await copy();

    expect(copyButton()).toHaveTextContent('Copied');
    expect(copyButton()).not.toHaveTextContent('#42');
    expect(screen.getByRole('status')).toHaveTextContent('Copied #42');

    act(() => vi.advanceTimersByTime(1999));

    expect(copyButton()).toHaveTextContent('Copied');

    act(() => vi.advanceTimersByTime(1));

    expect(copyButton()).toHaveTextContent('#42');
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it.each([
    ['refuses', { writeText: vi.fn().mockRejectedValue(new Error('Denied')) }],
    ['is unavailable', undefined],
  ])(
    'says it could not copy, beside the number to select, when the clipboard %s',
    async (_, clipboard) => {
      stubClipboard(clipboard);
      renderWithTheme(<CopyTicketNumber number={42} />);

      await copy();

      expect(copyButton()).toHaveTextContent("Couldn't copy");
      const number = screen.getByText('#42');
      expect(copyButton()).not.toContainElement(number);
      expect(screen.getByRole('status')).toHaveTextContent("Couldn't copy #42");
    },
  );
});
