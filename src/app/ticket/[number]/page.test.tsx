import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestTickets } from '../../../test/tickets';
import { appTickets } from '../../../tickets/app-tickets';
import TicketByNumberPage from './page';

const { notFound, redirect } = vi.hoisted(() => ({
  notFound: vi.fn((): never => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({ notFound, redirect }));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../../../tickets/app-tickets', () => ({ appTickets: vi.fn() }));

describe('TicketByNumberPage', () => {
  beforeEach(() => {
    notFound.mockClear();
    redirect.mockClear();
  });

  it('redirects a number-only link to the Project-scoped URL', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    await expect(
      TicketByNumberPage({
        params: Promise.resolve({ number: String(ticket.number) }),
      }),
    ).rejects.toThrow(
      `NEXT_REDIRECT:/project/${project.id}/ticket/${ticket.number}`,
    );

    expect(redirect).toHaveBeenCalledExactlyOnceWith(
      `/project/${project.id}/ticket/${ticket.number}`,
    );
  });
});
