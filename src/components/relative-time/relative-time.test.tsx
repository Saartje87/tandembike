import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { RelativeTime } from './relative-time';

describe('RelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['2026-03-10T11:59:30Z', 'just now'],
    ['2026-03-10T11:55:00Z', '5 minutes ago'],
    ['2026-03-10T09:00:00Z', '3 hours ago'],
    ['2026-03-09T12:00:00Z', 'yesterday'],
    ['2026-02-01T12:00:00Z', 'last month'],
    ['2024-03-10T12:00:00Z', '2 years ago'],
  ])('shows %s as "%s"', (iso, text) => {
    renderWithTheme(<RelativeTime date={new Date(iso)} />);

    expect(screen.getByRole('time')).toHaveTextContent(text);
  });

  it('gives the exact time on hover, machine-readable', () => {
    renderWithTheme(<RelativeTime date={new Date('2026-03-01T09:00:00Z')} />);

    const time = screen.getByRole('time');
    expect(time).toHaveAttribute('datetime', '2026-03-01T09:00:00.000Z');
    expect(time).toHaveAttribute(
      'title',
      expect.stringMatching(/^1 Mar 2026, \d{2}:\d{2}$/),
    );
  });
});
