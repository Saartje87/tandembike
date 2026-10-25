import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../../test/render';
import { createTestTickets } from '../../../test/tickets';
import { appTickets } from '../../../tickets/app-tickets';
import ProjectPage, { generateMetadata } from './page';

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn((): never => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound }));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../../../tickets/app-tickets', () => ({ appTickets: vi.fn() }));
vi.mock('../../../components/board/board', () => ({
  Board: ({
    project,
    tickets,
    header,
  }: {
    project: { name: string };
    tickets: { number: number }[];
    header: ReactNode;
  }) => (
    <section aria-label={project.name}>
      {header}
      {`Tickets: ${tickets.map((ticket) => `#${ticket.number}`).join(',')}`}
    </section>
  ),
}));
vi.mock('../../../components/project-tabs/project-tabs', () => ({
  ProjectTabs: ({
    cycles,
    current,
  }: {
    cycles: { title: string }[];
    current: number | string;
  }) => (
    <nav>{`Tabs: ${cycles.map(({ title }) => title).join(',')} current ${current}`}</nav>
  ),
}));

vi.mock('./board-ticket-drawer/board-ticket-drawer', () => ({
  BoardTicketDrawer: ({
    number,
    boardPath,
  }: {
    number: number;
    boardPath: string;
  }) => <div role="dialog">{`Drawer #${number} over ${boardPath}`}</div>,
}));
vi.mock(
  '../../../components/ticket-drawer-skeleton/ticket-drawer-skeleton',
  () => ({
    TicketDrawerSkeleton: () => null,
  }),
);

const noSearch = Promise.resolve({});

describe('ProjectPage', () => {
  beforeEach(() => {
    notFound.mockClear();
  });

  it("shows the Backlog's Tickets, those in no Cycle, beside the Cycles' tabs", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.createCycle({ projectId: project.id, title: 'Launch' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Planned',
      cycleId: beta.id,
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const params = Promise.resolve({ id: String(project.id) });
    renderWithTheme(
      <main>{await ProjectPage({ params, searchParams: noSearch })}</main>,
    );

    expect(screen.getByRole('navigation')).toHaveTextContent(
      'Tabs: Beta,Launch current backlog',
    );
    expect(screen.getByRole('region', { name: 'Website' })).toHaveTextContent(
      `Tickets: #${ticket.number}`,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await expect(
      generateMetadata({ params, searchParams: noSearch }),
    ).resolves.toEqual({ title: 'Website' });
  });

  it('returns not-found for a missing Project', async () => {
    vi.mocked(appTickets).mockReturnValue(createTestTickets());

    await expect(
      ProjectPage({
        params: Promise.resolve({ id: '999' }),
        searchParams: noSearch,
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalledOnce();
  });

  it('opens the Ticket named by ?ticket= in a drawer over the Backlog', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    vi.mocked(appTickets).mockReturnValue(tickets);
    const params = Promise.resolve({ id: String(project.id) });
    const searchParams = Promise.resolve({ ticket: String(ticket.number) });

    renderWithTheme(<main>{await ProjectPage({ params, searchParams })}</main>);

    expect(screen.getByRole('dialog')).toHaveTextContent(
      `Drawer #${ticket.number} over /project/${project.id}`,
    );
    await expect(generateMetadata({ params, searchParams })).resolves.toEqual({
      title: `#${ticket.number} Fix the header`,
    });
  });

  it('names the Board alone when ?ticket= names no Ticket of this Project', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const other = tickets.createProject({ name: 'App' });
    const elsewhere = tickets.createTicket({
      projectId: other.id,
      title: 'Other',
    });
    vi.mocked(appTickets).mockReturnValue(tickets);
    const params = Promise.resolve({ id: String(project.id) });

    for (const ticket of [String(elsewhere.number), '999', 'abc']) {
      await expect(
        generateMetadata({ params, searchParams: Promise.resolve({ ticket }) }),
      ).resolves.toEqual({ title: 'Website' });
    }
  });
});
