import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { CopyTicketNumber } from './copy-ticket-number';
import * as styles from './copy-ticket-number.css';

const stubClipboard = (clipboard: Partial<Clipboard> | undefined) =>
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: clipboard,
  });

const copyButton = () =>
  screen.getByRole('button', { name: 'Copy Ticket number T42' });

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

  it('copies the number as T42', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });
    renderWithTheme(<CopyTicketNumber number={42} />);

    expect(copyButton()).toHaveTextContent('T42');

    await copy();

    expect(writeText).toHaveBeenCalledWith('T42');
  });

  it('confirms the copy in place and announces it, then shows the number again', async () => {
    vi.useFakeTimers();
    stubClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    renderWithTheme(<CopyTicketNumber number={42} />);

    expect(screen.getByRole('status')).toHaveTextContent('');

    await copy();

    expect(copyButton()).toHaveTextContent('Copied');
    expect(copyButton()).not.toHaveTextContent('T42');
    expect(screen.getByRole('status')).toHaveTextContent('Copied T42');

    act(() => vi.advanceTimersByTime(1999));

    expect(copyButton()).toHaveTextContent('Copied');

    act(() => vi.advanceTimersByTime(1));

    expect(copyButton()).toHaveTextContent('T42');
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
      const number = screen.getByText('T42');
      expect(copyButton()).not.toContainElement(number);
      expect(screen.getByRole('status')).toHaveTextContent("Couldn't copy T42");
    },
  );
});

/** The icon shown over the number in the quiet variant, by its file name. */
/** jsdom applies no stylesheets, so the hidden number shows as its class. */
const numberHidden = () =>
  screen.getByText('T42').classList.contains(styles.hidden);

const iconIn = (element: HTMLElement) =>
  element
    .querySelector<HTMLElement>('[role="presentation"]')
    ?.style.maskImage.match(/outline\/(.+)\.svg/)?.[1];

describe('CopyTicketNumber, quiet', () => {
  afterEach(() => {
    stubClipboard(undefined);
    vi.useRealTimers();
  });

  it('copies the number as T42', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });
    renderWithTheme(<CopyTicketNumber number={42} quiet />);

    expect(copyButton()).toHaveTextContent('T42');
    expect(iconIn(copyButton())).toBeUndefined();
    expect(numberHidden()).toBe(false);

    await copy();

    expect(writeText).toHaveBeenCalledWith('T42');
  });

  it('shows a check over the hidden number for 2 s and announces it', async () => {
    vi.useFakeTimers();
    stubClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    renderWithTheme(<CopyTicketNumber number={42} quiet />);

    await copy();

    // The number keeps its space under the icon, so the width holds.
    expect(copyButton()).toHaveTextContent('T42');
    expect(copyButton()).not.toHaveTextContent('Copied');
    expect(numberHidden()).toBe(true);
    expect(iconIn(copyButton())).toBe('clipboard-document-check');
    expect(screen.getByRole('status')).toHaveTextContent('Copied T42');

    act(() => vi.advanceTimersByTime(2000));

    expect(numberHidden()).toBe(false);
    expect(iconIn(copyButton())).toBeUndefined();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('shows a warning over the number, with no extra text, when the copy fails', async () => {
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error('No')) });
    renderWithTheme(<CopyTicketNumber number={42} quiet />);

    await copy();

    expect(copyButton()).toHaveTextContent(/^T42$/);
    expect(numberHidden()).toBe(true);
    expect(iconIn(copyButton())).toBe('exclamation-triangle');
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't copy T42");
  });

  it.each([['metaKey'], ['ctrlKey'], ['shiftKey']])(
    'leaves a click with %s to the row, without copying',
    (key) => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      stubClipboard({ writeText });
      renderWithTheme(<CopyTicketNumber number={42} quiet />);

      fireEvent.click(copyButton(), { [key]: true });

      expect(writeText).not.toHaveBeenCalled();
    },
  );
});
