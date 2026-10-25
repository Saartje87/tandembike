import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { SplitOffTickets } from './split-off-tickets';

describe('SplitOffTickets', () => {
  it('links each Ticket split from the Origin, with its Status, and says when one is archived', () => {
    renderWithTheme(
      <SplitOffTickets
        items={[
          { number: 5, title: 'Pay by card', status: 'Done', archived: false },
          { number: 6, title: 'Refund', status: 'Todo', archived: true },
        ]}
      />,
    );

    const items = within(
      screen.getByRole('list', { name: 'Split-off Tickets' }),
    ).getAllByRole('listitem');
    expect(
      within(items[0]).getByRole('link', { name: '#5 Pay by card' }),
    ).toHaveAttribute('href', '/ticket/5');
    expect(items[0]).toHaveTextContent('Done');
    expect(items[1]).toHaveTextContent('Todo · Archived');
  });
});
