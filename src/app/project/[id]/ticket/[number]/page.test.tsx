import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../../../../test/render';
import { createTestTickets } from '../../../../../test/tickets';
import { appTickets } from '../../../../../tickets/app-tickets';
import TicketPage, { generateMetadata } from './page';

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn((): never => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound }));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../../../../../tickets/app-tickets', () => ({
  appTickets: vi.fn(),
}));
vi.mock('../../../../../components/board/board', () => ({
  Board: ({
    project,
    tickets,
    openTicket,
  }: {
    project: { name: string };
    tickets: { number: number }[];
    openTicket: number;
  }) => (
    <section aria-label={project.name}>
      {`${tickets.map((ticket) => `#${ticket.number}`).join(',')} open #${openTicket}`}
    </section>
  ),
}));
vi.mock('../../../../../components/ticket-drawer/ticket-drawer', () => ({
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

describe('ProjectTicketPage', () => {
  beforeEach(() => {
    notFound.mockClear();
  });

  it("shows the Ticket's Project Board with its drawer open", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    tickets.addComment(ticket.number, { body: 'Started.', author: 'agent' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const params = Promise.resolve({
      id: String(project.id),
      number: String(ticket.number),
    });
    renderWithTheme(<main>{await TicketPage({ params })}</main>);

    expect(screen.getByRole('region', { name: 'Website' })).toHaveTextContent(
      `#${ticket.number} open #${ticket.number}`,
    );
    expect(screen.getByRole('dialog')).toHaveTextContent(
      `Ticket drawer #${ticket.number} comments: Started.`,
    );
    await expect(generateMetadata({ params })).resolves.toEqual({
      title: `#${ticket.number} Fix the header`,
    });
  });

  it("shows a planned Ticket over its Cycle's tab", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: project.id, title: 'In the Backlog' });
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      cycleId: cycle.id,
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    renderWithTheme(
      <main>
        {
          await TicketPage({
            params: Promise.resolve({
              id: String(project.id),
              number: String(ticket.number),
            }),
          })
        }
      </main>,
    );

    expect(screen.getByRole('region', { name: 'Website' })).toHaveTextContent(
      `#${ticket.number} open #${ticket.number}`,
    );
  });

  it('does not show a Ticket under a different Project', async () => {
    const tickets = createTestTickets();
    const requestedProject = tickets.createProject({ name: 'Requested' });
    const owningProject = tickets.createProject({ name: 'Owning' });
    const ticket = tickets.createTicket({
      projectId: owningProject.id,
      title: 'Fix the header',
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    await expect(
      TicketPage({
        params: Promise.resolve({
          id: String(requestedProject.id),
          number: String(ticket.number),
        }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalledOnce();
  });

  it.each([
    ['missing Project', '999', '1'],
    ['missing Ticket', '1', '999'],
  ])('returns not-found for a %s', async (_scenario, id, number) => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: project.id, title: 'Fix the header' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    await expect(
      TicketPage({ params: Promise.resolve({ id, number }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalledOnce();
  });
});
