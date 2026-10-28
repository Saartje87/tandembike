import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  renderPage,
  renderPageError,
  renderWithTheme,
} from '../../../test/render';
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
    filter,
  }: {
    project: { name: string };
    tickets: { number: number }[];
    filter?: { query: string; labels: string[] };
  }) => (
    <section aria-label={project.name}>
      {`Tickets: ${tickets.map((ticket) => `T${ticket.number}`).join(',')}`}
      <p>{`Filter: ${JSON.stringify(filter)}`}</p>
    </section>
  ),
}));

vi.mock('./board-ticket-drawer/board-ticket-drawer', () => ({
  BoardTicketDrawer: ({ number }: { number: number }) =>
    `T${number}'s contents`,
}));
vi.mock('../../../components/ticket-drawer-shell/ticket-drawer-shell', () => ({
  TicketDrawerShell: ({
    number,
    boardPath,
    children,
  }: {
    number: number;
    boardPath: string;
    children: ReactNode;
  }) => (
    <div role="dialog">
      {`Drawer T${number} over ${boardPath}: `}
      {children}
    </div>
  ),
}));

const noSearch = Promise.resolve({});

describe('ProjectPage', () => {
  beforeEach(() => {
    notFound.mockClear();
  });

  it("shows the Backlog's Tickets, those in no Cycle, under the layout's tabs", async () => {
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
    await renderPage(
      <main>{await ProjectPage({ params, searchParams: noSearch })}</main>,
    );

    // The Project's layout shows its header and tabs.
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Website' })).toHaveTextContent(
      `Tickets: T${ticket.number}`,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await expect(
      generateMetadata({ params, searchParams: noSearch }),
    ).resolves.toEqual({ title: 'Website' });
  });

  it('shows the loading state until the Project loads', async () => {
    vi.mocked(appTickets).mockReturnValue(createTestTickets());

    renderWithTheme(
      <main>
        {
          await ProjectPage({
            params: new Promise(() => {}),
            searchParams: noSearch,
          })
        }
      </main>,
    );

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('returns not-found for a missing Project', async () => {
    vi.mocked(appTickets).mockReturnValue(createTestTickets());

    await expect(
      renderPageError(
        <main>
          {
            await ProjectPage({
              params: Promise.resolve({ id: '999' }),
              searchParams: noSearch,
            })
          }
        </main>,
      ),
    ).resolves.toMatchObject({ message: 'NEXT_NOT_FOUND' });
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

    await renderPage(
      <main>{await ProjectPage({ params, searchParams })}</main>,
    );

    expect(screen.getByRole('dialog')).toHaveTextContent(
      `Drawer T${ticket.number} over /project/${project.id}`,
    );
    await expect(generateMetadata({ params, searchParams })).resolves.toEqual({
      title: `T${ticket.number} Fix the header`,
    });
  });

  it('filters the Board by ?q= and ?label=, and closes the drawer to the filtered Board', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    vi.mocked(appTickets).mockReturnValue(tickets);
    const params = Promise.resolve({ id: String(project.id) });
    const searchParams = Promise.resolve({
      ticket: String(ticket.number),
      q: 'fix',
      label: ['bug', 'ui'],
    });

    await renderPage(
      <main>{await ProjectPage({ params, searchParams })}</main>,
    );

    expect(screen.getByRole('region', { name: 'Website' })).toHaveTextContent(
      'Filter: {"query":"fix","labels":["bug","ui"]}',
    );
    expect(screen.getByRole('dialog')).toHaveTextContent(
      `Drawer T${ticket.number} over /project/${project.id}?q=fix&label=bug&label=ui`,
    );
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
