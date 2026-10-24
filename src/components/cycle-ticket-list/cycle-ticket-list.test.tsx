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
  claim: null,
  acceptanceCriteria: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...fields,
});

describe('CycleTicketList', () => {
  it("lists an archived Cycle's Tickets with their Status, each opening it", () => {
    renderWithTheme(
      <CycleTicketList
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
    ).toHaveAttribute('href', '/project/3/ticket/2');
    expect(items[0]).toHaveTextContent('#2');
    expect(items[0]).toHaveTextContent('Done');
    expect(items[1]).toHaveTextContent('Todo · archived');
  });

  it('says when the Cycle held no Tickets', () => {
    renderWithTheme(<CycleTicketList tickets={[]} />);

    expect(screen.getByText('No Tickets in this Cycle')).toBeInTheDocument();
  });
});
