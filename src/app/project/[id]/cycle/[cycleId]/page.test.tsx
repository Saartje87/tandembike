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
  CycleHeader: ({ cycle }: { cycle: { title: string } }) => (
    <h2>{cycle.title}</h2>
  ),
}));

describe('CyclePage', () => {
  beforeEach(() => {
    notFound.mockClear();
  });

  it("shows the Cycle as a tab of its Project's Board", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const cycle = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
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
    await expect(generateMetadata({ params })).resolves.toEqual({
      title: 'Launch · Website',
    });
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
