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
    renderWithTheme(<main>{await ProjectPage({ params })}</main>);

    expect(screen.getByRole('navigation')).toHaveTextContent(
      'Tabs: Beta,Launch current backlog',
    );
    expect(screen.getByRole('region', { name: 'Website' })).toHaveTextContent(
      `Tickets: #${ticket.number}`,
    );
    await expect(generateMetadata({ params })).resolves.toEqual({
      title: 'Website',
    });
  });

  it('returns not-found for a missing Project', async () => {
    vi.mocked(appTickets).mockReturnValue(createTestTickets());

    await expect(
      ProjectPage({ params: Promise.resolve({ id: '999' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalledOnce();
  });
});
