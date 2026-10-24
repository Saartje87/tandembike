import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import type { Cycle } from '../../tickets/cycles';
import { CycleHistory } from './cycle-history';

const archived = (
  fields: Pick<Cycle, 'id' | 'title' | 'archivedAt'> & Partial<Cycle>,
): Cycle => ({
  projectId: 3,
  state: 'Archived',
  ticketNumbers: [],
  createdAt: new Date('2026-01-01'),
  ...fields,
});

describe('CycleHistory', () => {
  it('lists archived Cycles, newest archived first, each linking to it', () => {
    renderWithTheme(
      <CycleHistory
        cycles={[
          archived({
            id: 4,
            title: 'Alpha',
            archivedAt: new Date('2026-02-01'),
            ticketNumbers: [1],
          }),
          {
            ...archived({ id: 5, title: 'Beta', archivedAt: null }),
            state: 'Active',
          },
          archived({
            id: 6,
            title: 'Gamma',
            archivedAt: new Date('2026-03-01'),
            ticketNumbers: [2, 3],
          }),
        ]}
      />,
    );

    const items = within(
      screen.getByRole('list', { name: 'Archived Cycles' }),
    ).getAllByRole('listitem');
    expect(
      items.map((item) => within(item).getByRole('link').textContent),
    ).toEqual(['Gamma', 'Alpha']);
    expect(within(items[0]).getByRole('link')).toHaveAttribute(
      'href',
      '/project/3/cycle/6',
    );
    expect(items[0]).toHaveTextContent('2 Tickets');
    expect(items[1]).toHaveTextContent('1 Ticket');
  });

  it('says when no Cycle has been archived yet', () => {
    renderWithTheme(<CycleHistory cycles={[]} />);

    expect(screen.getByText('No archived Cycles yet')).toBeInTheDocument();
  });
});
