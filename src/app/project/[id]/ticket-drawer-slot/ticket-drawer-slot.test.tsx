import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../../../test/render';
import { createTestTickets } from '../../../../test/tickets';
import { appTickets } from '../../../../tickets/app-tickets';
import { TicketDrawerSlot } from './ticket-drawer-slot';

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn((): never => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound }));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../../../../tickets/app-tickets', () => ({
  appTickets: vi.fn(),
}));
vi.mock('../../../../components/ticket-drawer/ticket-drawer', () => ({
  TicketDrawer: ({
    ticket,
    comments,
  }: {
    ticket: { number: number };
    comments: { body: string }[];
  }) => (
    <div role="dialog">
      {`Ticket drawer #${ticket.number} comments: ${comments.map(({ body }) => body).join(',')}`}
    </div>
  ),
}));

describe('TicketDrawerSlot', () => {
  beforeEach(() => {
    notFound.mockClear();
  });

  it('renders the Ticket drawer for its Project slot', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    tickets.addComment(ticket.number, { body: 'Started.', author: 'agent' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    renderWithTheme(
      <div>
        {
          await TicketDrawerSlot({
            params: Promise.resolve({
              id: String(project.id),
              number: String(ticket.number),
            }),
          })
        }
      </div>,
    );

    expect(screen.getByRole('dialog')).toHaveTextContent(
      `Ticket drawer #${ticket.number} comments: Started.`,
    );
  });
});
