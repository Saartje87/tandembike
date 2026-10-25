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

  it("opens a number-only link over the Ticket's own Board", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const backlog = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    const planned = tickets.createTicket({
      projectId: project.id,
      title: 'Ship it',
    });
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.planTicket({ cycleId: cycle.id, number: planned.number });
    vi.mocked(appTickets).mockReturnValue(tickets);
    const open = (number: number) =>
      TicketByNumberPage({
        params: Promise.resolve({ number: String(number) }),
      });

    await expect(open(backlog.number)).rejects.toThrow(
      `NEXT_REDIRECT:/project/${project.id}?ticket=${backlog.number}`,
    );
    await expect(open(planned.number)).rejects.toThrow(
      `NEXT_REDIRECT:/project/${project.id}/cycle/${cycle.id}?ticket=${planned.number}`,
    );
  });

  it.each([
    ['a missing', '999'],
    ['a malformed', 'abc'],
  ])('shows not-found for %s number', async (_case, number) => {
    vi.mocked(appTickets).mockReturnValue(createTestTickets());

    await expect(
      TicketByNumberPage({ params: Promise.resolve({ number }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(redirect).not.toHaveBeenCalled();
  });
});
