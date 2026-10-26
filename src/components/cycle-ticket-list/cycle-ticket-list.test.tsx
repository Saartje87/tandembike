import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import type { Ticket } from '../../tickets/tickets';
import { CycleTicketList } from './cycle-ticket-list';

const ticket = (
  fields: Pick<Ticket, 'number' | 'title'> & Partial<Ticket>,
): Ticket => ({
  description: '',
  status: 'Todo',
  projectId: 3,
  position: 0,
  archived: false,
  labels: [],
  blockedBy: [],
  blocked: false,
  type: 'Ticket',
  color: null,
  epic: null,
  children: [],
  origin: null,
  splitOff: [],
  claim: null,
  acceptanceCriteria: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...fields,
});

const beta = { id: 7, projectId: 3 };

describe('CycleTicketList', () => {
  it("lists an archived Cycle's Tickets with their Status, each opening over the Cycle", () => {
    renderWithTheme(
      <CycleTicketList
        cycle={beta}
        tickets={[
          ticket({ number: 2, title: 'Ship it', status: 'Done' }),
          ticket({ number: 5, title: 'Polish', archived: true }),
        ]}
      />,
    );

    const items = within(
      screen.getByRole('list', { name: 'Tickets in this Cycle' }),
    ).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(
      within(items[0]).getByRole('link', { name: 'Ship it' }),
    ).toHaveAttribute('href', '/project/3/cycle/7?ticket=2');
    expect(items[0]).toHaveTextContent('T2');
    expect(items[0]).toHaveTextContent('Done');
    expect(items[1]).toHaveTextContent('Todo · archived');
  });

  it('opens a Ticket since moved to another Project over its own Board', () => {
    renderWithTheme(
      <CycleTicketList
        cycle={beta}
        tickets={[ticket({ number: 9, title: 'Moved', projectId: 4 })]}
      />,
    );

    expect(screen.getByRole('link', { name: 'Moved' })).toHaveAttribute(
      'href',
      '/ticket/9',
    );
  });

  it('says when the Cycle held no Tickets', () => {
    renderWithTheme(<CycleTicketList cycle={beta} tickets={[]} />);

    expect(screen.getByText('No Tickets in this Cycle')).toBeInTheDocument();
  });
});
