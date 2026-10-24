import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../../../../test/render';
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
vi.mock('../../../../../components/project-tabs/project-tabs', () => ({
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

describe('CyclePage', () => {
  beforeEach(() => {
    notFound.mockClear();
  });

  it("shows the Cycle's Tickets as a tab of its Project's Board", async () => {
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
    renderWithTheme(<main>{await CyclePage({ params })}</main>);

    expect(screen.getByRole('navigation')).toHaveTextContent(
      `Tabs: Beta,Launch current ${cycle.id}`,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Launch' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Website' })).toHaveTextContent(
      `Tickets: #${planned.number}`,
    );
    await expect(generateMetadata({ params })).resolves.toEqual({
      title: 'Launch · Website',
    });
  });

  it("shows an archived Cycle's final Tickets read-only, under the History tab", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const done = tickets.createTicket({
      projectId: project.id,
      title: 'Shipped',
      cycleId: cycle.id,
    });
    tickets.updateTicket(done.number, { status: 'Done' });
    tickets.startCycle(cycle.id);
    tickets.archiveCycle(cycle.id);
    vi.mocked(appTickets).mockReturnValue(tickets);

    renderWithTheme(
      <main>
        {
          await CyclePage({
            params: Promise.resolve({
              id: String(project.id),
              cycleId: String(cycle.id),
            }),
          })
        }
      </main>,
    );

    expect(screen.getByRole('navigation')).toHaveTextContent(
      'Tabs: Beta current history',
    );
    expect(
      screen.queryByRole('region', { name: 'Website' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Tickets in this Cycle' }),
    ).toHaveTextContent(`#${done.number}ShippedDone`);
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

    renderWithTheme(
      <main>
        {
          await CyclePage({
            params: Promise.resolve({
              id: String(project.id),
              cycleId: String(launch.id),
            }),
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
      CyclePage({
        params: Promise.resolve({
          id: String(requested.id),
          cycleId: String(cycle.id),
        }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalledOnce();
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
      CyclePage({ params: Promise.resolve({ id, cycleId }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalledOnce();
  });
});
