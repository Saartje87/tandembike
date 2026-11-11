// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appAutopilot } from '../../../autopilot/app-autopilot';
import { appConversations } from '../../../conversations/app-conversations';
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

vi.mock('next/navigation', () => ({ notFound, useRouter: vi.fn() }));
vi.mock('../../spars/actions', () => ({ startSpar: vi.fn() }));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../../../tickets/app-tickets', () => ({ appTickets: vi.fn() }));
vi.mock('../../../conversations/app-conversations', () => ({
  appConversations: vi.fn(() => ({
    list: () => [],
    triageBudget: () => null,
    openBatchTriage: () => null,
  })),
}));
vi.mock('../../../autopilot/app-autopilot', () => ({
  appAutopilot: vi.fn(() => ({ batchTriageTickets: () => [] })),
}));
vi.mock('../../conversations/actions', () => ({
  currentConversationActivity: vi.fn(() => new Promise(() => {})),
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

  it("shows today's triage spend against the ceiling on the Backlog while Auto-triage is on, and the pause over it", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.setProjectAgentSettings(project.id, {
      autoTriage: true,
      triageCeilingUsd: 2,
    });
    vi.mocked(appTickets).mockReturnValue(tickets);
    const stub = (spend: number) =>
      vi.mocked(appConversations).mockReturnValue({
        list: () => [],
        openBatchTriage: () => null,
        triageBudget: () => ({
          spend: spend,
          ceiling: 2,
          paused: spend >= 2,
        }),
      } as unknown as ReturnType<typeof appConversations>);
    const params = Promise.resolve({ id: String(project.id) });

    stub(0.5);
    await renderPage(
      <main>{await ProjectPage({ params, searchParams: noSearch })}</main>,
    );
    expect(screen.getByText('Triage today: $0.50 of $2.00')).toBeVisible();
    expect(screen.queryByText(/triage paused/)).not.toBeInTheDocument();
  });

  it('shows no triage spend while Auto-triage is off', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    vi.mocked(appTickets).mockReturnValue(tickets);
    vi.mocked(appConversations).mockReturnValue({
      list: () => [],
      openBatchTriage: () => null,
      triageBudget: () => null,
    } as unknown as ReturnType<typeof appConversations>);
    const params = Promise.resolve({ id: String(project.id) });

    await renderPage(
      <main>{await ProjectPage({ params, searchParams: noSearch })}</main>,
    );

    expect(screen.queryByText(/Triage today/)).not.toBeInTheDocument();
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
    // The Backlog is one column of sections, with no progress or run slots.
    expect(screen.getByRole('link', { name: 'Fix the header' })).toBeVisible();
    expect(screen.queryByText('Planned')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(/ done$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Runs /)).not.toBeInTheDocument();
    expect(ticket.number).toBeGreaterThan(0);
    expect(screen.queryByRole('dialog')).toBeNull();
    await expect(
      generateMetadata({ params, searchParams: noSearch }),
    ).resolves.toEqual({ title: 'Website' });
  });

  it('offers Triage N on the Backlog with the count of its Batch-triage Tickets, hidden at 0 (T1318)', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.setProjectAgentSettings(project.id, { repositoryPath: '/tmp' });
    vi.mocked(appTickets).mockReturnValue(tickets);
    const batchTriageTickets = vi.fn(() => [] as number[]);
    vi.mocked(appAutopilot).mockReturnValue({
      batchTriageTickets,
    } as unknown as ReturnType<typeof appAutopilot>);
    const params = Promise.resolve({ id: String(project.id) });

    await renderPage(
      <main>{await ProjectPage({ params, searchParams: noSearch })}</main>,
    );
    expect(screen.queryByRole('button', { name: /^Triage/ })).toBeNull();
    cleanup();

    batchTriageTickets.mockReturnValue([4, 9]);
    await renderPage(
      <main>{await ProjectPage({ params, searchParams: noSearch })}</main>,
    );

    expect(screen.getByRole('button', { name: 'Triage 2' })).toBeVisible();
    expect(batchTriageTickets).toHaveBeenCalledWith(project.id, null);
  });

  it('offers Plan on the Backlog once the Project has a repository (T1248)', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    vi.mocked(appTickets).mockReturnValue(tickets);
    const params = Promise.resolve({ id: String(project.id) });
    await renderPage(
      <main>{await ProjectPage({ params, searchParams: noSearch })}</main>,
    );
    expect(screen.queryByRole('button', { name: 'Plan' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Spar' })).toBeNull();
    cleanup();

    tickets.setProjectAgentSettings(project.id, { repositoryPath: '/tmp' });
    await renderPage(
      <main>{await ProjectPage({ params, searchParams: noSearch })}</main>,
    );

    expect(screen.getByRole('button', { name: 'Plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Spar' })).toBeInTheDocument();
  });

  it("lists only an Epic's children in the Backlog, saying when the rest are elsewhere", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const split = tickets.createTicket({
      projectId: project.id,
      title: 'Split Epic',
      type: 'Epic',
      labels: ['ready-for-agent'],
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Backlog child',
      epicNumber: split.number,
      labels: ['ready-for-agent'],
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Planned child',
      epicNumber: split.number,
      labels: ['ready-for-agent'],
      cycleId: beta.id,
    });
    const away = tickets.createTicket({
      projectId: project.id,
      title: 'Away Epic',
      type: 'Epic',
      labels: ['ready-for-agent'],
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Away child',
      epicNumber: away.number,
      labels: ['ready-for-agent'],
      cycleId: beta.id,
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    await renderPage(
      <main>
        {
          await ProjectPage({
            params: Promise.resolve({ id: String(project.id) }),
            searchParams: noSearch,
          })
        }
      </main>,
    );

    expect(screen.getByText('Backlog child')).toBeInTheDocument();
    expect(screen.queryByText('Planned child')).toBe(null);
    expect(screen.queryByText('Away child')).toBe(null);
    expect(
      screen.getByText('No children in the Backlog (1 elsewhere)'),
    ).toBeInTheDocument();
  });

  it("lists the Backlog's archived Tickets last, closed", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const dropped = tickets.createTicket({
      projectId: project.id,
      title: 'Dropped idea',
    });
    tickets.archiveTicket(dropped.number);
    vi.mocked(appTickets).mockReturnValue(tickets);

    await renderPage(
      <main>
        {
          await ProjectPage({
            params: Promise.resolve({ id: String(project.id) }),
            searchParams: noSearch,
          })
        }
      </main>,
    );

    const archived = screen.getByRole('region', { name: 'Archived' });
    expect(archived).toHaveTextContent('Dropped idea');
    expect(archived.querySelector('details')).not.toHaveAttribute('open');
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

    expect(screen.getByLabelText('Search Tickets')).toHaveValue('fix');
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
