import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../../../test/render';
import { createTestTickets } from '../../../../test/tickets';
import { appTickets } from '../../../../tickets/app-tickets';
import { BoardTicketDrawer } from './board-ticket-drawer';

vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../../../../tickets/app-tickets', () => ({ appTickets: vi.fn() }));
vi.mock('../../../../components/ticket-drawer/ticket-drawer', () => ({
  TicketDrawer: ({
    ticket,
    comments,
    boardPath,
  }: {
    ticket: { number: number };
    comments: { body: string }[];
    boardPath: string;
  }) => (
    <div role="dialog">
      {`Ticket drawer #${ticket.number} over ${boardPath} comments: ${comments.map(({ body }) => body).join(',')}`}
    </div>
  ),
}));

/** Tickets with a Project "Website" holding #1, and another holding #2. */
function setUp() {
  const tickets = createTestTickets();
  const website = tickets.createProject({ name: 'Website' });
  const app = tickets.createProject({ name: 'App' });
  const ticket = tickets.createTicket({
    projectId: website.id,
    title: 'Fix the header',
  });
  const elsewhere = tickets.createTicket({ projectId: app.id, title: 'Other' });
  tickets.addComment(ticket.number, { body: 'Started.', author: 'agent' });
  vi.mocked(appTickets).mockReturnValue(tickets);
  return { tickets, website, ticket, elsewhere };
}

describe('BoardTicketDrawer', () => {
  it("renders a Ticket's drawer over the Board it was opened on", async () => {
    const { website, ticket } = setUp();

    renderWithTheme(
      <div>
        {
          await BoardTicketDrawer({
            projectId: website.id,
            number: ticket.number,
            boardPath: '/project/1/cycle/7',
          })
        }
      </div>,
    );

    expect(screen.getByRole('dialog')).toHaveTextContent(
      `Ticket drawer #${ticket.number} over /project/1/cycle/7 comments: Started.`,
    );
  });

  it('renders nothing for a Ticket that does not exist (any more)', async () => {
    const { tickets, website, ticket } = setUp();
    tickets.deleteTicket(ticket.number);

    expect(
      await BoardTicketDrawer({
        projectId: website.id,
        number: ticket.number,
        boardPath: '/project/1',
      }),
    ).toBeNull();
  });

  it("renders nothing for another Project's Ticket", async () => {
    const { website, elsewhere } = setUp();

    expect(
      await BoardTicketDrawer({
        projectId: website.id,
        number: elsewhere.number,
        boardPath: '/project/1',
      }),
    ).toBeNull();
  });
});
