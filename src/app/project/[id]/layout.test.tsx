import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderPage, renderWithTheme } from '../../../test/render';
import { createTestTickets } from '../../../test/tickets';
import { appTickets } from '../../../tickets/app-tickets';
import ProjectLayout from './layout';

vi.mock('next/navigation', () => ({ notFound: vi.fn() }));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../../../tickets/app-tickets', () => ({ appTickets: vi.fn() }));
vi.mock('../../../components/project-tabs/project-tabs', () => ({
  ProjectTabs: ({
    projectId,
    cycles,
    openTicketCounts,
  }: {
    projectId: number;
    cycles: { id: number; title: string }[];
    openTicketCounts: { backlog: number; cycles: Record<number, number> };
  }) => (
    <nav>{`Tabs of ${projectId}: Backlog ${openTicketCounts.backlog}, ${cycles
      .map(({ id, title }) => `${title} ${openTicketCounts.cycles[id]}`)
      .join(', ')}`}</nav>
  ),
}));

const tab = <p>The tab</p>;

describe('ProjectLayout', () => {
  it("shows the Project's header and tabs, with their open Tickets, above the tab", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.createTicket({ projectId: project.id, title: 'Planned' });
    tickets.createTicket({ projectId: project.id, title: 'Unplanned' });
    tickets.createTicket({ projectId: project.id, title: 'Also unplanned' });
    tickets.planTicket({ cycleId: beta.id, number: 1 });
    vi.mocked(appTickets).mockReturnValue(tickets);

    await renderPage(
      <main>
        {
          await ProjectLayout({
            params: Promise.resolve({ id: String(project.id) }),
            children: tab,
          })
        }
      </main>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Website' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toHaveTextContent(
      `Tabs of ${project.id}: Backlog 2, Beta 1`,
    );
    expect(screen.getByText('The tab')).toBeInTheDocument();
  });

  it('shows the loading state until the Project loads', async () => {
    vi.mocked(appTickets).mockReturnValue(createTestTickets());

    renderWithTheme(
      <main>
        {await ProjectLayout({ params: new Promise(() => {}), children: tab })}
      </main>,
    );

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByText('The tab')).not.toBeInTheDocument();
  });

  it('shows the archived notice, without tabs, in place of the tab', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.archiveProject(project.id);
    vi.mocked(appTickets).mockReturnValue(tickets);

    await renderPage(
      <main>
        {
          await ProjectLayout({
            params: Promise.resolve({ id: String(project.id) }),
            children: tab,
          })
        }
      </main>,
    );

    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByText('The tab')).not.toBeInTheDocument();
  });

  it.each([
    ['missing', '999'],
    ['malformed', 'web'],
  ])(
    'leaves a %s Project to the tab, which shows not-found',
    async (_scenario, id) => {
      vi.mocked(appTickets).mockReturnValue(createTestTickets());

      await renderPage(
        <main>
          {
            await ProjectLayout({
              params: Promise.resolve({ id }),
              children: tab,
            })
          }
        </main>,
      );

      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
      expect(screen.getByText('The tab')).toBeInTheDocument();
    },
  );
});
