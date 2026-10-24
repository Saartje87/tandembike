import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../../../../test/render';
import TicketNotFound from './not-found';

describe('TicketNotFound', () => {
  it('explains that the Ticket could not be found without pointing to a sidebar', () => {
    renderWithTheme(<TicketNotFound />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Ticket not found' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'There is no Ticket in this Project with this number. Check the link and try again.',
      ),
    ).toBeInTheDocument();
  });
});
