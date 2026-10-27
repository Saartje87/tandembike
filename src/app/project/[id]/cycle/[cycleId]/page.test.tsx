import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  renderPage,
  renderPageError,
  renderWithTheme,
} from '../../../../../test/render';
import { createTestTickets } from '../../../../../test/tickets';
import { appTickets } from '../../../../../tickets/app-tickets';
import CyclePage, { generateMetadata } from './page';

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
    epics,
  }: {
    project: { name: string };
    tickets: { number: number }[];
    epics: { number: number }[];
  }) => (
    <section aria-label={project.name}>
      {`Tickets: ${tickets.map((ticket) => `T${ticket.number}`).join(',')}`}
      <p>{`Epics: ${epics.map((epic) => `T${epic.number}`).join(',')}`}</p>
    </section>
  ),
}));
vi.mock('../../../../../components/cycle-header/cycle-header', () => ({
  CycleHeader: ({
    cycle,
    activeCycle,
  }: {
    cycle: { title: string };
    activeCycle?: { title: string };
  }) => (
    <header>
      <h2>{cycle.title}</h2>
      {`Active: ${activeCycle?.title ?? 'none'}`}
    </header>
  ),
}));

vi.mock('../../board-ticket-drawer/board-ticket-drawer', () => ({
  BoardTicketDrawer: ({
    number,
    boardPath,
  }: {
    number: number;
    boardPath: string;
  }) => <div role="dialog">{`Drawer T${number} over ${boardPath}`}</div>,
}));
vi.mock(
  '../../../../../components/ticket-drawer-skeleton/ticket-drawer-skeleton',
  () => ({ TicketDrawerSkeleton: () => null }),
);

const noSearch = Promise.resolve({});

describe('CyclePage', () => {
  beforeEach(() => {
    notFound.mockClear();
  });

  it("shows the Cycle's header above its Board, under the layout's tabs", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const cycle = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });
    tickets.createTicket({ projectId: project.id, title: 'In the Backlog' });
    const planned = tickets.createTicket({
      projectId: project.id,
      title: 'Planned',
      cycleId: cycle.id,
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const params = Promise.resolve({
      id: String(project.id),
      cycleId: String(cycle.id),
    });
    await renderPage(
      <main>{await CyclePage({ params, searchParams: noSearch })}</main>,
    );

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Launch' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Website' })).toHaveTextContent(
      `Tickets: T${planned.number}`,
    );
    await expect(
      generateMetadata({ params, searchParams: noSearch }),
    ).resolves.toEqual({
      title: 'Launch · Website',
    });
  });

  it("gives the Board every live Epic of the Project, planned or not, to pick the Cycle's from", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const cycle = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      epicNumber: epic.number,
      cycleId: cycle.id,
    });
    const archived = tickets.createTicket({
      projectId: project.id,
      title: 'Old',
      type: 'Epic',
    });
    tickets.archiveTicket(archived.number);
    tickets.createTicket({ projectId: project.id, title: 'Not an Epic' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const params = Promise.resolve({
      id: String(project.id),
      cycleId: String(cycle.id),
    });
    await renderPage(
      <main>{await CyclePage({ params, searchParams: noSearch })}</main>,
    );

    expect(screen.getByText(/^Epics:/)).toHaveTextContent(
      `Epics: T${epic.number}`,
    );
  });

  it("shows an archived Cycle's final Tickets read-only", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const done = tickets.createTicket({
      projectId: project.id,
      title: 'Shipped',
      cycleId: cycle.id,
    });
    tickets.updateTicket(done.number, { status: 'Done' });
    const moved = tickets.createTicket({
      projectId: project.id,
      title: 'Moved',
      cycleId: cycle.id,
    });
    // Done, so it stays with the Cycle once archived, then moves Project.
    tickets.updateTicket(moved.number, { status: 'Done' });
    tickets.startCycle(cycle.id);
    tickets.archiveCycle(cycle.id);
    const other = tickets.createProject({ name: 'App' });
    tickets.updateTicket(moved.number, { projectId: other.id });
    vi.mocked(appTickets).mockReturnValue(tickets);

    await renderPage(
      <main>
        {
          await CyclePage({
            params: Promise.resolve({
              id: String(project.id),
              cycleId: String(cycle.id),
            }),
            searchParams: noSearch,
          })
        }
      </main>,
    );

    // The mocked Board lists its Tickets; the History page has no Board.
    expect(screen.queryByText(/^Tickets:/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Tickets in this Cycle' }),
    ).toHaveTextContent(`T${done.number}ShippedDoneT${moved.number}MovedDone`);
  });

  it("tells a Prepared Cycle's header which Cycle is Active", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });
    tickets.startCycle(beta.id);
    vi.mocked(appTickets).mockReturnValue(tickets);

    await renderPage(
      <main>
        {
          await CyclePage({
            params: Promise.resolve({
              id: String(project.id),
              cycleId: String(launch.id),
            }),
            searchParams: noSearch,
          })
        }
      </main>,
    );

    expect(screen.getByRole('banner')).toHaveTextContent('Active: Beta');
  });

  it("does not show another Project's Cycle", async () => {
    const tickets = createTestTickets();
    const requested = tickets.createProject({ name: 'Requested' });
    const owning = tickets.createProject({ name: 'Owning' });
    const cycle = tickets.createCycle({ projectId: owning.id, title: 'Beta' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    await expect(
      renderPageError(
        <main>
          {
            await CyclePage({
              params: Promise.resolve({
                id: String(requested.id),
                cycleId: String(cycle.id),
              }),
              searchParams: noSearch,
            })
          }
        </main>,
      ),
    ).resolves.toMatchObject({ message: 'NEXT_NOT_FOUND' });
    expect(notFound).toHaveBeenCalledOnce();
  });

  it('shows the loading state until the Project and Cycle load', async () => {
    vi.mocked(appTickets).mockReturnValue(createTestTickets());

    renderWithTheme(
      <main>
        {
          await CyclePage({
            params: new Promise(() => {}),
            searchParams: noSearch,
          })
        }
      </main>,
    );

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it.each([
    ['missing Project', '999', '1'],
    ['missing Cycle', '1', '999'],
    ['malformed Cycle id', '1', 'beta'],
  ])('returns not-found for a %s', async (_scenario, id, cycleId) => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createCycle({ projectId: project.id, title: 'Beta' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    await expect(
      renderPageError(
        <main>
          {
            await CyclePage({
              params: Promise.resolve({ id, cycleId }),
              searchParams: noSearch,
            })
          }
        </main>,
      ),
    ).resolves.toMatchObject({ message: 'NEXT_NOT_FOUND' });
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("opens ?ticket= in a drawer that closes to the Cycle's tab", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Ship it',
      cycleId: cycle.id,
    });
    vi.mocked(appTickets).mockReturnValue(tickets);
    const params = Promise.resolve({
      id: String(project.id),
      cycleId: String(cycle.id),
    });
    const searchParams = Promise.resolve({ ticket: String(ticket.number) });

    await renderPage(<main>{await CyclePage({ params, searchParams })}</main>);

    expect(screen.getByRole('dialog')).toHaveTextContent(
      `Drawer T${ticket.number} over /project/${project.id}/cycle/${cycle.id}`,
    );
    await expect(generateMetadata({ params, searchParams })).resolves.toEqual({
      title: `T${ticket.number} Ship it`,
    });
  });
});
