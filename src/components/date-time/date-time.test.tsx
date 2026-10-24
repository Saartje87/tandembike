import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { DateTime } from './date-time';

describe('DateTime', () => {
  it('shows a date and time as a machine-readable time', () => {
    renderWithTheme(<DateTime date={new Date('2026-03-01T09:00:00Z')} />);

    const time = screen.getByRole('time');
    expect(time).toHaveAttribute('datetime', '2026-03-01T09:00:00.000Z');
    expect(time).toHaveTextContent(/^1 Mar 2026, \d{2}:\d{2}$/);
  });
});
